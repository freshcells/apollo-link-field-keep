import type {
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  OperationDefinitionNode,
  SelectionSetNode,
  VariableDefinitionNode,
  DefinitionNode,
  ArgumentNode,
} from 'graphql'
import { visit } from 'graphql/language/visitor'
import { filterInPlace } from 'apollo-utilities/lib/util/filterInPlace'
import {
  RemoveArgumentsConfig,
  removeArgumentsFromDocument,
  FragmentMap,
  GetDirectiveConfig,
  RemoveFragmentSpreadConfig,
  removeFragmentSpreadFromDocument,
  getFragmentDefinition,
  getFragmentDefinitions,
  getOperationDefinition,
  createFragmentMap,
  isField,
  isInlineFragment,
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

function getAllFragmentSpreadsFromSelectionSet(
  selectionSet: SelectionSetNode
): FragmentSpreadNode[] {
  const allFragments: FragmentSpreadNode[] = []

  selectionSet.selections.forEach((selection) => {
    if (
      (isField(selection) || isInlineFragment(selection)) &&
      selection.selectionSet
    ) {
      getAllFragmentSpreadsFromSelectionSet(
        selection.selectionSet as SelectionSetNode
      ).forEach((frag) => allFragments.push(frag))
    } else if (selection.kind === 'FragmentSpread') {
      allFragments.push(selection)
    }
  })

  return allFragments
}

export const getFieldName = (node: FieldNode): string => {
  return node.alias?.value || node.name?.value
}

type PossibleDocuments =
  | DocumentNode
  | FragmentDefinitionNode
  | FieldNode
  | ReadonlyArray<DefinitionNode>
type Keys = keyof PossibleDocuments

export const collectSelectionPath = (
  path: ReadonlyArray<string | number>,
  document: DocumentNode
): (string | number)[] => {
  let pointer: PossibleDocuments = document
  const fieldPath: Array<string | number> = []
  path.forEach((key) => {
    pointer = pointer[key as Keys]
    if ((pointer as unknown as FieldNode).kind === 'Field') {
      fieldPath.push(getFieldName(pointer as unknown as FieldNode))
    }
  })
  return fieldPath
}

type RemovablePaths = Array<{ field: string; path: Array<string | number> }>

export const findOriginalPaths = (
  paths: RemovablePaths,
  document: DocumentNode | null
): Array<Array<string | number>> => {
  if (document === null) {
    return []
  }
  return paths.map((v) => {
    const fieldNames: Array<string | number> = []
    let pointer: PossibleDocuments = document
    let lastFragment: string | null = null
    const fragments: Record<string, Array<string | number>> = {}
    v.path.forEach((key) => {
      pointer = pointer[key as Keys]
      // 1. If we deal with fragment definitions, we save them
      // 2. ...and then we require to find the fragment and apply the right path to it.
      if (
        (pointer as unknown as FragmentDefinitionNode).kind ===
        'FragmentDefinition'
      ) {
        lastFragment = (pointer as unknown as FragmentDefinitionNode).name.value
        fragments[lastFragment] = []
      }
      if ((pointer as unknown as FieldNode).kind === 'Field') {
        ;(lastFragment ? fragments[lastFragment] : fieldNames).push(
          getFieldName(pointer as unknown as FieldNode)
        )
      }
    })
    const possibleFragments = Object.keys(fragments)
    if (possibleFragments.length > 0) {
      visit(document, {
        FragmentSpread: {
          enter: (node: FragmentSpreadNode, index, parent, path) => {
            if (fragments[node.name.value]) {
              const fragmentPath = collectSelectionPath(path, document)
              fieldNames.push(...fragmentPath, ...fragments[node.name.value])
            }
          },
        },
      })
    }
    return fieldNames
  })
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
      const sliced = path.splice(index + 1, path.length)
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
): { modifiedDoc: DocumentNode | null; pathsToRemove: RemovablePaths } {
  const variablesInUse = Object.create(null)
  const variablesToRemove: RemoveArgumentsConfig[] = []
  const pathsToRemove: Array<{ field: string; path: (string | number)[] }> = []
  const fragmentSpreadsInUse = Object.create(null)
  const fragmentSpreadsToRemove: RemoveFragmentSpreadConfig[] = []

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
        enter(node, key, parent, path) {
          if (directives && node.directives) {
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
              pathsToRemove.push({ field: node.name.value, path: [...path] })
              if (node.arguments) {
                // Store field argument variables so they can be removed
                // from the operation definition.
                node.arguments.forEach(removeVariables)
              }

              if (node.selectionSet) {
                // Store fragment spread names so they can be removed from the
                // document.
                getAllFragmentSpreadsFromSelectionSet(
                  node.selectionSet
                ).forEach((frag) => {
                  fragmentSpreadsToRemove.push({
                    name: frag.name.value,
                  })
                })
              }
              // Remove the field.
              return null
            }
          }
          return node
        },
      },

      FragmentSpread: {
        enter(node) {
          // Keep track of referenced fragment spreads. This is used to
          // determine if top level fragment definitions should be removed.
          fragmentSpreadsInUse[node.name.value] = true
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
          return node
        },
      },
    })
  )

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

  // If we've removed selection sets with fragment spreads, make sure the
  // associated fragment definitions are also removed from the rest of the
  // document, as long as they aren't being used elsewhere.
  if (
    modifiedDoc &&
    filterInPlace(
      fragmentSpreadsToRemove,
      (fs) => !fragmentSpreadsInUse[fs.name as string]
    ).length
  ) {
    modifiedDoc = <DocumentNode>(
      removeFragmentSpreadFromDocument(fragmentSpreadsToRemove, modifiedDoc)
    )
  }

  return { pathsToRemove, modifiedDoc }
}
