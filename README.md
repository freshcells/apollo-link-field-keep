apollo-link-field-keep
---------------------

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![GitHub license badge](https://badgen.net/github/license/freshcells/apollo-link-field-keep)](https://opensource.org/licenses/MIT)
[![Code coverage](https://badgen.net/codecov/c/github/freshcells/apollo-link-field-keep)]()

**EXPERIMENTAL**

Allows bypassing certain parts of the query before it's send to the server.

### Use cases

- Feature toggling

### Setup

    import KeepLink from '@freshcells/apollo-link-field-keep'

    // ...

    const keepLink = new KeepLink()

    const apolloClient = new ApolloClient({
      link: from([
        keepLink,
        // .. other links
      ]),
    })

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

If `shouldKeep` in this example is true, it will remove the whole `field` query including arguments.
It will also clean up all variables that might be used (if not used by other fields).

To prevent Apollo Cache issues it will fill the field with `null` when returned from the server.
