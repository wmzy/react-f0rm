import React from 'react';
import { Sandpack } from '@codesandbox/sandpack-react';

export default function Playground({ code }: { code: string }) {
  return (
    <Sandpack
      template="react-ts"
      files={{
        '/App.tsx': code,
      }}
      customSetup={{
        dependencies: {
          'react-f0rm': 'latest',
        },
      }}
    />
  );
}
