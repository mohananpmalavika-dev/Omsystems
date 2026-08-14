import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    // Server-side decoding is optional - client-side jsQR is primary method
    // If packages aren't installed, return error and client will handle it
    return NextResponse.json(
      {
        error: 'Server-side QR decoding not available',
        message: 'Use client-side scanning or install: npm install jimp qrcode-reader',
        fallbackToClient: true
      },
      { status: 501 } // Not Implemented
    );

  } catch (error) {
    console.error('QR decode error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown error',
        fallbackToClient: true
      },
      { status: 500 }
    );
  }
}
