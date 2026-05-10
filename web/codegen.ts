import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: '../packages/protocol/src/schema.graphql',
  documents: 'src/gql/**/*.graphql',
  generates: {
    'src/gql/generated/': {
      preset: 'client',
      plugins: [],
    },
  },
};

export default config;
