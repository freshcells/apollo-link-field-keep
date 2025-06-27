import type {
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  OperationDefinitionNode,
  VariableDefinitionNode,
  ArgumentNode,
  SelectionNode,
} from 'graphql'
import { visit } from 'graphql/language/visitor'
import { filterInPlace } from 'apollo-utilities/lib/util/filterInPlace'
import {
  RemoveArgumentsConfig,
  removeArgumentsFromDocument,
  FragmentMap,
  GetDirectiveConfig,
  getFragmentDefinition,
  getFragmentDefinitions,
  getOperationDefinition,
  createFragmentMap,
} from 'apollo-utilities'

interface RemoveDirectiveConfig {
  name?: string
  test?: (node: DirectiveNode) => boolean
  remove: (node: DirectiveNode) => boolean
}

function isEmpty<T extends OperationDefinitionNode | FragmentDefinitionNode>(
  op: T,
  fragments: FragmentMap
): boolean {
  return op.selectionSet.selections.every(
    (selection) =>
      selection.kind === 'FragmentSpread' &&
      isEmpty(fragments[selection.name.value], fragments)
  )
}

function nullIfDocIsEmpty(doc: DocumentNode) {
  return isEmpty(
    getOperationDefinition(doc) || getFragmentDefinition(doc),
    createFragmentMap(getFragmentDefinitions(doc))
  )
    ? null
    : doc
}

function getDirectiveMatcher(
  directives: (RemoveDirectiveConfig | GetDirectiveConfig)[]
) {
  return function directiveMatcher(directive: DirectiveNode) {
    return directives.some(
      (dir) =>
        (dir.name && dir.name === directive.name.value) ||
        (dir.test && dir.test(directive))
    )
  }
}

export const getFieldName = (node: FieldNode): string => {
  return node.alias?.value || node.name?.value
}

type FieldNodeCollection = Array<FieldNode>
type FragmentsMap = { [key: string]: FragmentDefinitionNode }

const walkSelections = (
  selections: readonly SelectionNode[],
  parentPath: readonly string[],
  allFragments: FragmentsMap,
  nodes: FieldNode[]
) => {
  return selections.reduce((next, node) => {
    let nextPath: Array<Array<string>> = []
    if (node.kind === 'InlineFragment') {
      nextPath = [
        ...nextPath,
        ...walkSelections(
          node.selectionSet.selections,
          parentPath,
          allFragments,
          nodes
        ),
      ]
    }
    if (node.kind === 'FragmentSpread') {
      const fragment: FragmentDefinitionNode | undefined =
        allFragments[(node as FragmentSpreadNode).name.value]
      if (fragment) {
        nextPath = [
          ...nextPath,
          ...walkSelections(
            fragment.selectionSet.selections,
            parentPath,
            allFragments,
            nodes
          ),
        ]
      }
    }
    let path: string[] = []
    if (node.kind === 'Field') {
      if (nodes.indexOf(node) !== -1) {
        path = [...parentPath, getFieldName(node)]
      }
      if (node.selectionSet) {
        nextPath = [
          ...nextPath,
          ...walkSelections(
            node.selectionSet.selections,
            [...parentPath, getFieldName(node)],
            allFragments,
            nodes
          ),
        ]
      }
    }
    return path.length > 0
      ? [path, ...nextPath, ...next]
      : [...nextPath, ...next]
  }, [] as Array<Array<string>>)
}

const findNodePathInDocument = (document: DocumentNode, nodes: FieldNode[]) => {
  const operationDefinition: OperationDefinitionNode | undefined =
    document.definitions.find((def) => def.kind === 'OperationDefinition') as
      | OperationDefinitionNode
      | undefined

  const allFragmentsInDocument = (
    document.definitions.filter(
      (m) => m.kind === 'FragmentDefinition'
    ) as FragmentDefinitionNode[]
  ).reduce((next, fragment) => {
    return {
      [fragment.name.value]: fragment,
      ...next,
    }
  }, {} as { [key: string]: FragmentDefinitionNode })

  if (operationDefinition) {
    return walkSelections(
      operationDefinition.selectionSet.selections,
      [],
      allFragmentsInDocument,
      nodes
    )
  }
  return []
}

export const findNodePaths = (
  paths: FieldNodeCollection,
  document: DocumentNode | null
): Array<Array<string | number>> => {
  if (document === null) {
    return []
  }
  return findNodePathInDocument(document, paths)
}

/**
 * Mutates an object and initializes it with the given path
 * @param {Object} object the object
 * @param {Array<string>} path the path to set
 * @param value
 */
export const setInObject = <T extends Record<string | number, any>>(
  object: T | undefined | null,
  path: Array<keyof T>,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  value: any
): void => {
  let pointer = object
  path.forEach((key, index) => {
    if (!pointer) {
      return
    }
    // only set if we reached the full object path's
    if (pointer[key] === undefined && index === path.length - 1) {
      pointer[key] = value
      return
    }
    pointer = pointer[key]
    if (Array.isArray(pointer)) {
      const sliced = Array.from(path).splice(index + 1, path.length)
      pointer.forEach((item) => {
        setInObject(item, sliced, value)
      })
    }
  })
}

// Base logic taken from 'apollo-utilities'
// As most of the dependent methods are not public inside the module, and the logic is a bit different
// we moved it to the project.
export function removeDirectivesFromDocument(
  directives: RemoveDirectiveConfig[],
  doc: DocumentNode
): { modifiedDoc: DocumentNode | null; nodesToRemove: FieldNodeCollection } {
  const variablesInUse: Record<string, boolean> = {}
  const variablesToRemove: RemoveArgumentsConfig[] = []
  const nodesToRemove: FieldNodeCollection = []
  const removeVariables = (arg: ArgumentNode) => {
    if (arg.value.kind === 'Variable') {
      variablesToRemove.push({
        name: arg.value.name.value,
      })
    }
  }

  let modifiedDoc = nullIfDocIsEmpty(
    visit(doc, {
      Variable: {
        enter(node, _key, parent) {
          // Store each variable that's referenced as part of an argument
          // (excluding operation definition variables), so we know which
          // variables are being used. If we later want to remove a variable
          // we'll fist check to see if it's being used, before continuing with
          // the removal.
          if (
            (parent as VariableDefinitionNode).kind !== 'VariableDefinition'
          ) {
            variablesInUse[node.name.value] = true
          }
        },
      },
      Field: {
        enter(node) {
          if (directives && node.directives?.length) {
            // If `remove` is set to true for a directive, and a directive match
            // is found for a field, remove the field as well.
            const shouldRemoveField = directives.some(
              (directive) =>
                node.directives && node.directives.some(directive.remove)
            )
            const matches =
              node.directives &&
              node.directives.some(getDirectiveMatcher(directives))

            // We have to remove variables that are referenced in directives
            if (matches && node.directives) {
              node.directives.forEach(
                (d) => d.arguments && d.arguments.forEach(removeVariables)
              )
            }
            if (shouldRemoveField && node.directives && matches) {
              nodesToRemove.push(node)
              if (node.arguments) {
                // Store field argument variables so they can be removed
                // from the operation definition.
                node.arguments.forEach(removeVariables)
              }
              // Remove the field.
              return null
            }
          }
          return
        },
      },
      Directive: {
        enter(node) {
          // If a matching directive is found, remove it.
          if (getDirectiveMatcher(directives)(node)) {
            if (node.arguments) {
              node.arguments.forEach(removeVariables)
            }
            return null
          }
          return
        },
      },
    })
  )

  if (modifiedDoc === doc) {
    return { nodesToRemove: [], modifiedDoc: doc }
  }

  // If we've removed fields with arguments, make sure the associated
  // variables are also removed from the rest of the document, as long as they
  // aren't being used elsewhere.
  if (
    modifiedDoc &&
    filterInPlace(variablesToRemove, (v) => !variablesInUse[v.name as string])
      .length
  ) {
    modifiedDoc = <DocumentNode>(
      removeArgumentsFromDocument(variablesToRemove, modifiedDoc)
    )
  }

  // Remove inline fragments which have empty selections

  if (modifiedDoc) {
    modifiedDoc = <DocumentNode>visit(modifiedDoc, {
      InlineFragment: {
        enter(node) {
          return node.selectionSet.selections.length === 0 ? null : node
        },
      },
      FragmentDefinition: {
        enter(node) {
          return node.selectionSet.selections.length === 0 ? null : node
        },
      },
      FragmentSpread: {
        enter(node) {
          const fragmentEmpty = modifiedDoc?.definitions?.find((def) => {
            return (
              def.kind === 'FragmentDefinition' &&
              def.name.value === node.name.value &&
              def.selectionSet?.selections?.length === 0
            )
          })
          return fragmentEmpty ? null : node
        },
      },
    })
  }

  return { nodesToRemove, modifiedDoc }
}
