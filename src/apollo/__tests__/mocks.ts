import { FetchResult, gql, Observable } from '@apollo/client'

export const productsQuery = gql`
  fragment offerFragment on Offer {
    rooms {
      room {
        name
        codes {
          label
          code
          keyLabel @keep(ifFeature: "feature1")
        }
      }
    }
    extras @keep(ifFeature: "feature2") {
      type
      included
      description
    }
  }

  query productsQuery {
    products {
      packageProducts {
        topOffer {
          ...offerFragment
        }
      }
    }
  }
`

export const productsMockResult = Observable.of<FetchResult>({
  data: {
    products: {
      packageProducts: [
        {
          topOffer: {
            rooms: {
              room: [
                {
                  name: null,
                  codes: [
                    {
                      label: 'Doppelzimmer',
                      code: 'XXX01',
                      __typename: 'GlobalTypeAttribute',
                    },
                  ],
                  __typename: 'Room',
                },
              ],
              __typename: 'OfferRooms',
            },
            __typename: 'Offer',
            extras: null,
          },
          __typename: 'PackageProduct',
        },
        {
          topOffer: {
            rooms: {
              room: [
                {
                  name: null,
                  codes: [
                    {
                      label: 'Doppelzimmer',
                      code: 'XXX01',
                      __typename: 'GlobalTypeAttribute',
                    },
                  ],
                  __typename: 'Room',
                },
              ],
              __typename: 'OfferRooms',
            },
            __typename: 'Offer',
            extras: null,
          },
          __typename: 'PackageProduct',
        },
      ],
      __typename: 'PackageProductResponse',
    },
  },
})

export const fragmentQuery = gql`
  fragment myFragment on MyType {
    label
    key @keep(ifFeature: "someFeature")
  }

  fragment otherFragment on MyType {
    label
  }

  query fragmentQuery {
    myType {
      nested {
        ...otherFragment
      }
      wow {
        ...myFragment
      }
    }
  }
`

export const fragmentMockResult = Observable.of<FetchResult>({
  data: {
    myType: {
      nested: [
        {
          label: 'xyz',
          __typename: 'MyType',
        },
      ],
      wow: [
        { label: 'wow', __typename: 'MyType' },
        { label: 'wow', __typename: 'MyType' },
        { label: 'wow', __typename: 'MyType' },
      ],
    },
  },
})

export const simpleQuery = gql`
  query simpleQuery {
    myType {
      nested {
        label
      }
    }
  }
`

export const queryWithDefaults = gql`
  query queryWithDefaults($someArg: Boolean! = false) {
    myType {
      field @keep(if: $someArg)
      other
    }
  }
`
export const queryWithDefaultsMockResult = Observable.of<FetchResult>({
  data: {
    myType: {
      other: 'other',
      __typename: 'MyType',
    },
  },
})

export const simpleMockResult = Observable.of<FetchResult>({
  data: {
    myType: {
      nested: [{ label: 'whoo', __typename: 'MyType' }],
    },
  },
})

export const variablesQuery = gql`
  query variablesQuery($keepComplexResolver: Boolean!) {
    myOtherType {
      complex @keep(if: $keepComplexResolver)
    }
  }
`

export const variablesMockResult = Observable.of<FetchResult>({
  data: {
    myOtherType: {
      __typename: 'MyOtherType',
    },
  },
})
