import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, email, institution, role } = await req.json()

    // Get the user to access their ID
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { userInfo: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Use a transaction to update both user and userInfo
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Update user basic info
      const userUpdate = await tx.user.update({
        where: { id: user.id },
        data: { 
          name, 
          email
        },
        include: { userInfo: true }
      })

      // Update userInfo if institution or role are provided
      if (institution !== undefined || role !== undefined) {
        if (user.userInfo) {
          // Update existing userInfo
          await tx.userInfo.update({
            where: { id: user.userInfo.id },
            data: {
              ...(institution !== undefined ? { institution } : {}),
              ...(role !== undefined ? { role } : {})
            }
          })
        } else {
          // Create userInfo if it doesn't exist
          await tx.userInfo.create({
            data: {
              userId: user.id,
              institution: institution || '',
              role: role || ''
            }
          })
        }
      }

      return userUpdate
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Profile update error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
} 