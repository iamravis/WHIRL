import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = session.user.email
    console.log('Processing image upload for user:', userEmail)

    const formData = await req.formData()
    const file = formData.get('image') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    console.log('Image size:', buffer.length, 'bytes')

    // Generate unique filename with proper extension
    const fileExtension = file.name.split('.').pop() || 'jpg'
    const fileName = `${uuidv4()}.${fileExtension}`
    
    // Create directory if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public')
    const uploadsDir = path.join(publicDir, 'uploads')
    const profileImagesDir = path.join(uploadsDir, 'profile-images')
    
    try {
      // Ensure directory exists
      await mkdir(profileImagesDir, { recursive: true })
      console.log('Directory created/exists:', profileImagesDir)
      
      // Save the file
      const filePath = path.join(profileImagesDir, fileName)
      await writeFile(filePath, buffer)
      console.log('File saved successfully at:', filePath)
    } catch (error) {
      console.error('Error saving file to disk:', error)
      return NextResponse.json(
        { error: 'Failed to save image to disk' },
        { status: 500 }
      )
    }

    // Generate URL that can be used in the frontend
    const imageUrl = `/uploads/profile-images/${fileName}`
    console.log('Generated image URL:', imageUrl)

    try {
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: userEmail }
      })
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      
      // Update user profile image
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { image: imageUrl },
      })
      
      console.log('Updated user in database with new image URL:', imageUrl)
      
      return NextResponse.json({ 
        imageUrl, 
        success: true,
        message: 'Profile image updated successfully' 
      })
    } catch (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Image upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    )
  }
} 