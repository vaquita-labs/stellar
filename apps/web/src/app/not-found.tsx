'use client';
import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
    return (
      <main className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <Image
            src="/vaquita/error.svg"
            alt="Error"
            width={200}
            height={200}
            className="mx-auto mb-6"
          />
          <h1 className="text-4xl font-bold text-gray-800">404</h1>
          <p className="mt-2 text-gray-600">Oops! Page not found</p>
          <Link href="/home" className="mt-2 inline-block bg-primary text-black px-4 py-2 rounded-md font-medium">Go back to home</Link>
        </div>
      </main>
    );
  }
  