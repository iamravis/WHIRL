import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'

export async function DELETE(req: Request) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions)
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = session.user.email
    console.log(`Deleting account for user: ${userEmail}`)

    // Find the user to get their ID and profile image
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        chats: true // Include chats to get all associated chats
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log(`Found user with ID: ${user.id} and ${user.chats.length} chats`)

    // Try to delete profile image if it exists and is a local file
    if (user.image && user.image.startsWith('/uploads/')) {
      try {
        const imagePath = path.join(process.cwd(), 'public', user.image)
        await fs.unlink(imagePath)
        console.log(`Deleted profile image: ${imagePath}`)
      } catch (error) {
        console.error('Error deleting profile image:', error)
        // Continue with account deletion even if image deletion fails
      }
    }

    // Delete all chat messages for all user's chats
    if (user.chats.length > 0) {
      const chatIds = user.chats.map(chat => chat.id)
      await prisma.message.deleteMany({
        where: {
          chatId: {
            in: chatIds
          }
        }
      })
      console.log(`Deleted all messages for ${chatIds.length} chats`)
    }

    // Delete all chats
    await prisma.chat.deleteMany({
      where: {
        userId: user.id
      }
    })
    console.log(`Deleted all chats for user ${user.id}`)

    // Finally, delete the user
    await prisma.user.delete({
      where: {
        id: user.id
      }
    })
    console.log(`Successfully deleted user ${user.id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
} 