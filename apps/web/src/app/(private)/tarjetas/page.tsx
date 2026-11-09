import { redirect } from 'next/navigation';

// Old address of the Cards tab; it lives on /cards now.
export default function Page() {
  redirect('/cards');
}
