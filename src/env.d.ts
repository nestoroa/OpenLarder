/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PORT: string;
}

declare namespace App {
  interface Locals {
    user: {
      id: number;
      name: string;
      email: string;
      avatar_url: string | null;
    };
  }
}
