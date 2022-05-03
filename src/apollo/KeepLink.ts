import type { DocumentNode, DirectiveNode } from 'graphql'
import {
  ApolloLink,
  Observable,
  Operation,
  NextLink,
  FetchResult,
} from '@apollo/client'
import { argumentsObjectFromField } from 'apollo-utilities'
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

  // The field path's where we have set null later
  const nullFields = findNodePaths(nodesToRemove, document)

  return { modifiedDoc: modifiedDoc as T, nullFields }
}

export class KeepLink extends ApolloLink {
  private _enabledFeatures: string[] = []

  public set enabledFeatures(features: string[]) {
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
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      operation.query,
      operation.variables,
      this._enabledFeatures
    )
    operation.query = modifiedDoc
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
