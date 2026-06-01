const lang = 'en';

const mock_dictionary: { [key: string]: { [key: string]: string } } = {
  ['es']: {
    ['deposit']: 'deposit',
    'Loading configuration...': 'Loading configuration...',
    'Loading...': 'Loading...',
    'First connect your wallet': 'First connect your wallet',
  },
};

export const T = ({ children }: { children: string }) => mock_dictionary[lang]?.[children] ?? children;
