import { DocumentNode, DirectiveNode, print } from 'graphql'
import {
  ApolloLink,
  Observable,
  Operation,
  NextLink,
  FetchResult,
} from '@apollo/client'
import { argumentsObjectFromField, getOperationName } from 'apollo-utilities'
import {
  findNodePaths,
  removeDirectivesFromDocument,
  setInObject,
} from './utils'

export const DIRECTIVE = 'keep'

interface DirectiveArguments extends Record<string, any> {
  if?: boolean
  ifFeature?: string
}

export function removeIgnoreSetsFromDocument<T extends DocumentNode>(
  document: T,
  variables: Record<string, any>,
  enabledFeatures: Array<string>
): { modifiedDoc: T; nullFields: Array<Array<string | number>> } {
  const { modifiedDoc, nodesToRemove } = removeDirectivesFromDocument(
    [
      {
        // if the directive should be removed
        test: (directive?: DirectiveNode) => {
          return directive?.name?.value === DIRECTIVE
        },
        // If we should remove the whole field request
        remove: (directive?: DirectiveNode) => {
          if (directive?.name?.value === DIRECTIVE) {
            const args: DirectiveArguments = argumentsObjectFromField(
              directive,
              variables
            )
            if (process.env.NODE_ENV !== 'production') {
              if (
                args.if ||
                (Object.hasOwn(args, 'if') && args.if === undefined) ||
                args.if === false
              ) {
                console.warn(
                  `KeepLink: (Operation: "${getOperationName(
                    document
                  )}") Using @keep(if: ..) is deprecated and should be avoided. Please use "ifFeature" instead. Location: ${print(
                    directive
                  )} with variables:`,
                  variables
                )
              }
            }

            if (args.ifFeature !== undefined && args.if !== undefined) {
              return !(
                args.if && enabledFeatures.indexOf(args.ifFeature) !== -1
              )
            }
            if (args.ifFeature) {
              return enabledFeatures.indexOf(args.ifFeature) === -1
            }

            return args.if === false
          }
          return false
        },
      },
    ],
    document
  )

  if (modifiedDoc === document) {
    return { modifiedDoc: modifiedDoc as T, nullFields: [] }
  }

  // The field path's where we have set null later
  const nullFields = findNodePaths(nodesToRemove, document)

  return { modifiedDoc: modifiedDoc as T, nullFields }
}

export class KeepLink extends ApolloLink {
  private _enabledFeatures: string[] = []
  private _docsCache = new WeakMap<
    DocumentNode,
    { modifiedDoc: DocumentNode; nullFields: (string | number)[][] }
  >()

  public set enabledFeatures(features: string[]) {
    if (this._enabledFeatures !== features) {
      // reset cache if features changed
      this._docsCache = new WeakMap<
        DocumentNode,
        { modifiedDoc: DocumentNode; nullFields: (string | number)[][] }
      >()
    }
    this._enabledFeatures = features
  }

  constructor(features: string[] = []) {
    super()
    this._enabledFeatures = features
  }

  request(operation: Operation, forward: NextLink): Observable<FetchResult> {
    const directives = `directive @${DIRECTIVE} on FIELD`

    operation.setContext(({ schemas = [] }) => ({
      schemas: (schemas as Record<string, string>[]).concat([{ directives }]),
    }))
    let nullFields = [] as (string | number)[][]
    if (this._docsCache.has(operation.query)) {
      const { modifiedDoc, nullFields: cachedNullFields } = this._docsCache.get(
        operation.query
      )!
      nullFields = cachedNullFields
      operation.query = modifiedDoc
    } else {
      const { modifiedDoc, nullFields: newNullFields } =
        removeIgnoreSetsFromDocument(
          operation.query,
          operation.variables,
          this._enabledFeatures
        )
      this._docsCache.set(operation.query, {
        modifiedDoc,
        nullFields: newNullFields,
      })

      nullFields = newNullFields
      operation.query = modifiedDoc
    }

    // only apply the changes if we actually removed fields.
    if (nullFields.length > 0) {
      return new Observable((observer) => {
        const obs = forward(operation)
        return obs.subscribe({
          next({
            data,
            errors,
          }: FetchResult<Record<string | number, unknown>>) {
            nullFields.forEach((fields) => {
              // To fix issues with apollo caching, we pretend that the server still returns the fields
              // but with null values, this is according to the GraphQL spec.
              setInObject(data, fields, null)
            })
            return observer.next({ data, errors })
          },
          error: observer.error.bind(observer),
          complete: observer.complete.bind(observer),
        })
      })
    }
    return forward(operation)
  }
}
