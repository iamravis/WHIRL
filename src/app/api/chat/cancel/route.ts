import { NextResponse } from 'next/server';

// This is the API endpoint to cancel an ongoing generation
export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }
    
    console.log(`Cancelling generation for session: ${sessionId}`);
    
    // Send cancel request to the backend server
    const backendResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:8080'}/api/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    
    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      console.error('Error from backend:', errorData);
      return NextResponse.json({ error: 'Failed to cancel generation' }, { status: backendResponse.status });
    }
    
    return NextResponse.json({ success: true, message: 'Generation cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling generation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 