import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

const httpLink = new HttpLink({
  uri: '/graphql', // The gateway will proxy this to the gateway service
});

export const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});
