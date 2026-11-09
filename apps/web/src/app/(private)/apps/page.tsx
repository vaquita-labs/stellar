import { redirect } from 'next/navigation';

// Old address of the 3D world; it lives on /world now.
export default function Page() {
  redirect('/world');
}
