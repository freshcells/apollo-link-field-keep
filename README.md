apollo-link-field-keep
---------------------

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![GitHub license badge](https://badgen.net/github/license/freshcells/apollo-link-field-keep)](https://opensource.org/licenses/MIT)
[![npm](https://badgen.net/github/release/freshcells/apollo-link-field-keep)](https://www.npmjs.com/package/@freshcells/apollo-link-field-keep)
[![codecov](https://codecov.io/gh/freshcells/apollo-link-field-keep/branch/main/graph/badge.svg?token=GCIBUG9Z7J)](https://codecov.io/gh/freshcells/apollo-link-field-keep)

**EXPERIMENTAL**

Similar to `@include` and `@skip`, but allows bypassing certain parts of the query completely
before sending it to the server

[API Documentation](https://freshcells.github.io/apollo-link-field-keep/api/)

### Use cases

- Feature toggling

### Setup

Available from the `npm` package registry with

    yarn add @freshcells/apollo-link-field-keep

    npm install @freshcells/apollo-link-field-keep

#### Usage
```ts
    import KeepLink from '@freshcells/apollo-link-field-keep'

    // ...

    const keepLink = new KeepLink()

    // if you want to use ifFeature conditions, add also the following line, otherwise skip it:
    keepLink.setEnabledFeatures([ 'feature1' ])

    const apolloClient = new ApolloClient({
      link: from([
        keepLink,
        // .. other links
      ]),
    })
```

You can then use the `@keep` directive as:

```graphql
query someQuery($argValue: String! $shouldKeep: Boolean!) {
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
```

If `$shouldKeep` in this example is `false`, it will remove the whole `field` query including arguments.
It will also clean up all variables that might be used (if not used by other fields).

If you have a query that is used in multiple components and needs to include a certain field everywhere,
you can use `ifFeature` instead of `if` as:

```graphql
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
```

It will work exactly the same way as `$shouldKeep` in the previous example. With this approach you just save time 
as you do not need to pass the same variables to all query use cases.

It is also possible to combine `if` and `ifFeature`:

```graphql
query someQuery($argValue: String! $shouldKeep: Boolean!) {
      someOther {
        subFieldOther(someArg: $argValue) {
          subSubFieldOther
        }
      }
      field(someArg: $argValue) @keep(if: $shouldKeep ifFeature: "feature1") {
        subFieldA
        subFieldB
      }
}
```

In this case the fields will only be included if both `$shouldKeep` is true and `feature1` is enabled.

To prevent Apollo Cache issues it will fill the field with `null` when returned from the server.
