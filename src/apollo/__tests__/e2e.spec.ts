import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { KeepLink } from '../KeepLink'
import {
  fragmentMockResult,
  productsMockResult,
  productsQuery,
  fragmentQuery,
  simpleMockResult,
  simpleQuery,
  variablesMockResult,
  variablesQuery,
  queryWithDefaultsMockResult,
  queryWithDefaults,
  queryWithOptionalDefaults,
  queryWithOptionalDefaultsMockResult,
} from './mocks'

describe('KeepLink e2e', () => {
  const link = ApolloLink.from([
    new KeepLink(),
    new ApolloLink((operation) => {
      switch (operation.operationName) {
        case 'simpleQuery':
          return simpleMockResult
        case 'fragmentQuery':
          return fragmentMockResult
        case 'productsQuery':
          return productsMockResult
        case 'variablesQuery':
          return variablesMockResult
        case 'queryWithDefaults':
          return queryWithDefaultsMockResult
        case 'queryWithOptionalDefaults':
          return queryWithOptionalDefaultsMockResult
        default:
          throw new Error('Not implemented.')
      }
    }),
  ])

  const cache = new InMemoryCache()

  const client = new ApolloClient({
    link,
    cache,
  })

  beforeEach(() => {
    cache.reset()
  })

  it('should handle multiple queries correctly', async () => {
    const result = await client.query({
      variables: { includeKey: false },
      errorPolicy: 'all',
      query: fragmentQuery,
    })

    expect(result.data).toEqual(
      cache.readQuery({
        query: fragmentQuery,
        variables: { includeKey: false },
      })
    )

    const secondResult = await client.query({
      errorPolicy: 'all',
      query: simpleQuery,
    })
    expect(secondResult.data).toEqual(cache.readQuery({ query: simpleQuery }))
  })
  it('should handle deeply nested queries', async () => {
    const result = await client.query({ query: productsQuery })
    expect(result.data).toEqual(cache.readQuery({ query: productsQuery }))
  })

  it('should handle variables correctly', async () => {
    const queryArgs = {
      query: variablesQuery,
      variables: { keepComplexResolver: false },
    }
    const result = await client.query({ ...queryArgs, errorPolicy: 'all' })
    expect(result.data).toEqual(cache.readQuery(queryArgs))
  })

  describe('Default variables', () => {
    it('should use default value when variable is not provided', async () => {
      const queryArgs = {
        query: queryWithDefaults,
        variables: {},
      }
      const result = await client.query({ ...queryArgs, errorPolicy: 'all' })
      expect(result.data).toEqual(cache.readQuery(queryArgs))
    })
    it('should handle undefined', async () => {
      const queryArgs = {
        query: queryWithDefaults,
        variables: { someArg: undefined },
      }
      const result = await client.query({ ...queryArgs, errorPolicy: 'all' })
      expect(result.data).toEqual(cache.readQuery(queryArgs))
    })
    it('should handle optional undefined', async () => {
      const queryArgs = {
        query: queryWithOptionalDefaults,
        variables: { someArg: undefined },
      }
      const result = await client.query({ ...queryArgs, errorPolicy: 'all' })
      expect(result.data).toEqual(cache.readQuery(queryArgs))
    })
  })
})
