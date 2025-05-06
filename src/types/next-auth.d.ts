import NextAuth from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string
      name: string
      email: string
      image?: string | null
      institution?: string | null
      role?: string | null
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    institution?: string | null
    role?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    institution?: string | null
    role?: string | null
  }
} 