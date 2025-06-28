import { gql } from '@apollo/client'
import { print } from 'graphql/language/printer'
import { removeIgnoreSetsFromDocument } from '../KeepLink'
import { setInObject } from '../utils'

describe('A document without `@keep`', () => {
  const queryWithDefaults = gql`
    query someQuery {
      test {
        some
      }
      field {
        subFieldA
        subFieldB
      }
    }
  `
  it('should not modify the document', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(
      queryWithDefaults,
      {},
      []
    )
    expect(modifiedDoc).toBe(queryWithDefaults)
  })
  it('should work with a second time with caches', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(
      queryWithDefaults,
      {},
      []
    )
    expect(modifiedDoc).toBe(queryWithDefaults)
  })
})
describe('KeepLink with if', () => {
  const query = gql`
    query someQuery($shouldKeep: Boolean!) {
      test {
        some
      }
      field @keep(if: $shouldKeep) {
        subFieldA
        subFieldB
      }
    }
  `
  it('should remove directives and fields if shouldKeep is false', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(
      query,
      {
        shouldKeep: false,
      },
      []
    )
    expect(print(modifiedDoc)).toMatchSnapshot()
  })
  it('should keep fields, but remove directives if shouldKeep is true', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(
      query,
      {
        shouldKeep: true,
      },
      []
    )
    expect(print(modifiedDoc)).toMatchSnapshot()
  })

  describe('Field Arguments', () => {
    const queryWithArgument = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        someOther {
          subFieldOther
        }
        field(someArg: $argValue) @keep(if: $shouldKeep) {
          subFieldA
          subFieldB
        }
      }
    `
    const queryWithArgumentAndUsedElsewhere = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        someOther {
          subFieldOther(someArg: $argValue) {
            subSubFieldOther
          }
        }
        field(someArg: $argValue) @keep(if: $shouldKeep) {
          subFieldA
          subFieldB
        }
      }
    `

    it('should remove query argument variables if exists', () => {
      const { modifiedDoc } = removeIgnoreSetsFromDocument(
        queryWithArgument,
        {
          shouldKeep: false,
          argValue: 'test',
        },
        []
      )
      expect(print(modifiedDoc)).toMatchSnapshot()
    })

    it('should keep variables if they are used elsewhere', () => {
      const { modifiedDoc } = removeIgnoreSetsFromDocument(
        queryWithArgumentAndUsedElsewhere,
        { shouldKeep: false, argValue: 'test' },
        []
      )
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Deep Fields', () => {
    const deeperQuery = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        someOther {
          subFieldOther
        }
        field {
          subFieldA
          subFieldB {
            deep(someArg: $argValue) @keep(if: $shouldKeep) {
              test {
                wow
              }
            }
          }
        }
      }
    `
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      deeperQuery,
      { shouldKeep: false, argValue: 'test' },
      []
    )
    expect(nullFields).toEqual([['field', 'subFieldB', 'deep']])
    expect(print(modifiedDoc)).toMatchSnapshot()
  })

  describe('Fragment', () => {
    const someFragment = gql`
      fragment ifQueryFragment on Type {
        arg @keep(if: $shouldKeep) {
          test
        }
      }
    `
    const fragmentQuery = gql`
      query someQuery($shouldKeep: Boolean!) {
        deeply {
          nested {
            ...ifQueryFragment
          }
        }
      }
      ${someFragment}
    `

    it('should work with fragments', () => {
      const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
        fragmentQuery,
        { shouldKeep: false },
        []
      )
      expect(nullFields).toEqual([['deeply', 'nested', 'arg']])
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Aliases', () => {
    const someFragment = gql`
      fragment someOtherIfFragment on Type {
        aliasForSome: some @keep(if: $shouldKeep) {
          test
        }
      }
    `
    const fragmentQuery = gql`
      query someQuery($shouldKeep: Boolean!) {
        aliasForDeeply: deeply {
          nested {
            ...someOtherIfFragment
          }
        }
      }
      ${someFragment}
    `

    it('should properly map aliases', () => {
      const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
        fragmentQuery,
        { shouldKeep: false },
        []
      )
      expect(nullFields).toEqual([['aliasForDeeply', 'nested', 'aliasForSome']])
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Empty documents', () => {
    const queryThatWillBeEmpty = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        field(someArg: $argValue) @keep(if: $shouldKeep) {
          subFieldA
          subFieldB
        }
      }
    `
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      queryThatWillBeEmpty,
      { shouldKeep: false },
      []
    )

    expect(nullFields).toEqual([['field']])
    expect(modifiedDoc).toBe(null)
  })
})

describe('KeepLink with ifFeature', () => {
  const features = ['feature1']
  const query = gql`
    query someQuery {
      test {
        some
      }
      field @keep(ifFeature: "feature1") {
        subFieldA
        subFieldB
      }
    }
  `
  it('should remove directives and fields if feature1 is not enabled', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(query, {}, [])
    expect(print(modifiedDoc)).toMatchSnapshot()
  })
  it('should keep fields, but remove directives if feature1 is enabled', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(query, {}, features)
    expect(print(modifiedDoc)).toMatchSnapshot()
  })

  describe('Field Arguments', () => {
    const queryWithArgument = gql`
      query someQuery($argValue: String!) {
        someOther {
          subFieldOther
        }
        field(someArg: $argValue) @keep(ifFeature: "feature1") {
          subFieldA
          subFieldB
        }
      }
    `
    const queryWithArgumentAndUsedElsewhere = gql`
      query someQuery($argValue: String!) {
        someOther {
          subFieldOther(someArg: $argValue) {
            subSubFieldOther
          }
        }
        field(someArg: $argValue) @keep(ifFeature: "feature1") {
          subFieldA
          subFieldB
        }
      }
    `

    it('should remove argument variables if exists', () => {
      const { modifiedDoc } = removeIgnoreSetsFromDocument(
        queryWithArgument,
        {
          argValue: 'test',
        },
        []
      )
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
    it('should keep variables if they are used elsewhere', () => {
      const { modifiedDoc } = removeIgnoreSetsFromDocument(
        queryWithArgumentAndUsedElsewhere,
        { argValue: 'test' },
        []
      )
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Deep Fields', () => {
    const deeperQuery = gql`
      query someQuery($argValue: String!) {
        someOther {
          subFieldOther
        }
        field {
          subFieldA
          subFieldB {
            deep(someArg: $argValue) @keep(ifFeature: "feature1") {
              test {
                wow
              }
            }
          }
        }
      }
    `
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      deeperQuery,
      { argValue: 'test' },
      []
    )
    expect(nullFields).toEqual([['field', 'subFieldB', 'deep']])
    expect(print(modifiedDoc)).toMatchSnapshot()
  })

  describe('Fragment', () => {
    const someFragment = gql`
      fragment ifFeatureQueryFragment on Type {
        arg @keep(ifFeature: "feature1") {
          test
        }
      }
    `
    const fragmentQuery = gql`
      query someQuery {
        deeply {
          nested {
            ...ifFeatureQueryFragment
          }
        }
      }
      ${someFragment}
    `

    it('should work with fragments', () => {
      const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
        fragmentQuery,
        {},
        []
      )
      expect(nullFields).toEqual([['deeply', 'nested', 'arg']])
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Aliases', () => {
    const someFragment = gql`
      fragment someOtherIfFeatureFragment on Type {
        aliasForSome: some @keep(ifFeature: "feature1") {
          test
        }
      }
    `
    const fragmentQuery = gql`
      query someQuery {
        aliasForDeeply: deeply {
          nested {
            ...someOtherIfFeatureFragment
          }
        }
      }
      ${someFragment}
    `

    it('should properly map aliases', () => {
      const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
        fragmentQuery,
        {},
        []
      )
      expect(nullFields).toEqual([['aliasForDeeply', 'nested', 'aliasForSome']])
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Empty documents', () => {
    const queryThatWillBeEmpty = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        field(someArg: $argValue) @keep(ifFeature: "feature1") {
          subFieldA
          subFieldB
        }
      }
    `
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      queryThatWillBeEmpty,
      {},
      []
    )

    expect(nullFields).toEqual([['field']])
    expect(modifiedDoc).toBe(null)
  })
})

describe('KeepLink with if and ifFeature', () => {
  const features = ['feature1']
  const query = gql`
    query someQuery($shouldKeep: Boolean!) {
      test {
        some
      }
      field @keep(if: $shouldKeep, ifFeature: "feature1") {
        subFieldA
        subFieldB
      }
    }
  `
  it('should remove directives and fields if shouldKeep is false and feature1 is not enabled', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(
      query,
      {
        shouldKeep: false,
      },
      []
    )
    expect(print(modifiedDoc)).toMatchSnapshot()
  })
  it('should keep fields, but remove directives if shouldKeep is true and feature1 is enabled', () => {
    const { modifiedDoc } = removeIgnoreSetsFromDocument(
      query,
      {
        shouldKeep: true,
      },
      features
    )
    expect(print(modifiedDoc)).toMatchSnapshot()
  })

  describe('Field Arguments', () => {
    const queryWithArgument = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        someOther {
          subFieldOther
        }
        field(someArg: $argValue)
          @keep(if: $shouldKeep, ifFeature: "feature1") {
          subFieldA
          subFieldB
        }
      }
    `
    const queryWithArgumentAndUsedElsewhere = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        someOther {
          subFieldOther(someArg: $argValue) {
            subSubFieldOther
          }
        }
        field(someArg: $argValue)
          @keep(if: $shouldKeep, ifFeature: "feature1") {
          subFieldA
          subFieldB
        }
      }
    `

    it('should remove argument variables if exists', () => {
      const { modifiedDoc } = removeIgnoreSetsFromDocument(
        queryWithArgument,
        {
          shouldKeep: false,
          argValue: 'test',
        },
        []
      )
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
    it('should keep variables if they are used elsewhere', () => {
      const { modifiedDoc } = removeIgnoreSetsFromDocument(
        queryWithArgumentAndUsedElsewhere,
        { shouldKeep: false, argValue: 'test' },
        []
      )
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Deep Fields', () => {
    const deeperQuery = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        someOther {
          subFieldOther
        }
        field {
          subFieldA
          subFieldB {
            deep(someArg: $argValue)
              @keep(if: $shouldKeep, ifFeature: "feature1") {
              test {
                wow
              }
            }
          }
        }
      }
    `
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      deeperQuery,
      { shouldKeep: false, argValue: 'test' },
      []
    )
    expect(nullFields).toEqual([['field', 'subFieldB', 'deep']])
    expect(print(modifiedDoc)).toMatchSnapshot()
  })

  describe('Fragment', () => {
    const someFragment = gql`
      fragment ifAndIfFeatureQueryFragment on Type {
        arg @keep(if: $shouldKeep, ifFeature: "feature1") {
          test
        }
      }
    `
    const fragmentQuery = gql`
      query someQuery($shouldKeep: Boolean!) {
        deeply {
          nested {
            ...ifAndIfFeatureQueryFragment
          }
        }
      }
      ${someFragment}
    `

    it('should work with fragments', () => {
      const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
        fragmentQuery,
        { shouldKeep: false },
        []
      )
      expect(nullFields).toEqual([['deeply', 'nested', 'arg']])
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Aliases', () => {
    const someFragment = gql`
      fragment someOtherIfAndIfFeatureFragment on Type {
        aliasForSome: some @keep(if: $shouldKeep, ifFeature: "feature1") {
          test
        }
      }
    `
    const fragmentQuery = gql`
      query someQuery($shouldKeep: Boolean!) {
        aliasForDeeply: deeply {
          nested {
            ...someOtherIfAndIfFeatureFragment
          }
        }
      }
      ${someFragment}
    `

    it('should properly map aliases', () => {
      const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
        fragmentQuery,
        { shouldKeep: false },
        []
      )
      expect(nullFields).toEqual([['aliasForDeeply', 'nested', 'aliasForSome']])
      expect(print(modifiedDoc)).toMatchSnapshot()
    })
  })

  describe('Empty documents', () => {
    const queryThatWillBeEmpty = gql`
      query someQuery($argValue: String!, $shouldKeep: Boolean!) {
        field(someArg: $argValue)
          @keep(if: $shouldKeep, ifFeature: "feature1") {
          subFieldA
          subFieldB
        }
      }
    `
    const { modifiedDoc, nullFields } = removeIgnoreSetsFromDocument(
      queryThatWillBeEmpty,
      { shouldKeep: false },
      []
    )

    expect(nullFields).toEqual([['field']])
    expect(modifiedDoc).toBe(null)
  })
})

describe('utilities', () => {
  describe('setInObject', () => {
    it('should work for full objects', () => {
      const object: Record<string, any> = {
        a: [
          { b: { wow: 'test' } },
          { b: { wow: 'test' } },
          { b: { wow: 'test' } },
        ],
      }
      setInObject(object, ['a', 'b', 'nice'], null)
      expect(object).toEqual({
        a: [
          { b: { wow: 'test', nice: null } },
          { b: { wow: 'test', nice: null } },
          {
            b: {
              wow: 'test',
              nice: null,
            },
          },
        ],
      })
    })
    it('should work for null paths', () => {
      const object: Record<string, any> = { a: null }
      setInObject(object, ['a', 'b', 'nice'], null)
      expect(object).toEqual({ a: null })
    })
    it('should work for undefined paths', () => {
      const object: Record<string, any> = {}
      setInObject(object, ['a', 'b', 'nice'], null)
      expect(object).toEqual({})
    })
  })
})

describe('fragments', () => {
  it('should remove unused fragments', () => {
    const queryWithFragments = gql`
      fragment myFragment on SomeType {
        field @keep(ifFeature: "someFeature")
      }
      query myQuery {
        field {
          someOtherKey
          ...myFragment
        }
      }
    `
    const { nullFields, modifiedDoc } = removeIgnoreSetsFromDocument(
      queryWithFragments,
      {},
      []
    )
    expect(nullFields).toEqual([['field', 'field']])
    expect(print(modifiedDoc)).toEqual(
      print(gql`
        query myQuery {
          field {
            someOtherKey
          }
        }
      `)
    )
  })
})

describe('complex nested mutations and fragments', () => {
  const complexNested = gql`
    fragment level2 on OtherType {
      nice
      to
      have @keep(ifFeature: "someFeature")
      some @keep(ifFeature: "someFeature") {
        subselection
      }
    }
    fragment level1 on MyType {
      label
      oneOnLevel1 @keep(ifFeature: "someFeature")
      goesToLevel2 {
        ...level2
      }
    }
    mutation complexWithNestedFragments {
      complexWithNestedFragments {
        nested {
          firstLevelKey @keep(ifFeature: "someFeature")
          ...level1
        }
      }
    }
  `

  const { nullFields, modifiedDoc } = removeIgnoreSetsFromDocument(
    complexNested,
    {},
    []
  )
  expect(nullFields).toEqual([
    ['complexWithNestedFragments', 'nested', 'goesToLevel2', 'some'],
    ['complexWithNestedFragments', 'nested', 'goesToLevel2', 'have'],
    ['complexWithNestedFragments', 'nested', 'oneOnLevel1'],
    ['complexWithNestedFragments', 'nested', 'firstLevelKey'],
  ])
  expect(print(modifiedDoc)).toMatchSnapshot()
})
describe('handle inline fragments', () => {
  const inlineFragment = gql`
    mutation complexWithNestedFragments {
      complexWithNestedFragments {
        nested {
          ... on SomeType {
            firstLevelKey @keep(ifFeature: "someFeature")
            primaryFunction
            ... on SomeOtherType {
              deeper @keep(ifFeature: "someFeature")
            }
          }
        }
      }
    }
  `
  const { nullFields, modifiedDoc } = removeIgnoreSetsFromDocument(
    inlineFragment,
    {},
    []
  )
  expect(nullFields).toEqual([
    ['complexWithNestedFragments', 'nested', 'deeper'],
    ['complexWithNestedFragments', 'nested', 'firstLevelKey'],
  ])
  expect(print(modifiedDoc)).toMatchSnapshot()
})
