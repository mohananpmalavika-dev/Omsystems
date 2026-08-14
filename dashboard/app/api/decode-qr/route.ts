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

    // Convert image to buffer
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Try to decode QR code using jimp and qrcode-reader
    try {
      // Dynamic import to avoid bundling issues
      const Jimp = (await import('jimp')).default;
      const QrCode = (await import('qrcode-reader')).default;

      const jimpImage = await Jimp.read(buffer);
      const qr = new QrCode();

      const qrData = await new Promise<string>((resolve, reject) => {
        qr.callback = (err: any, value: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(value?.result || '');
          }
        };
        qr.decode(jimpImage.bitmap);
      });

      if (!qrData) {
        return NextResponse.json(
          { error: 'No QR code found in image' },
          { status: 400 }
        );
      }

      return NextResponse.json({ qrData });
    } catch (decodeError) {
      // If jimp/qrcode-reader are not installed, return error with installation instructions
      return NextResponse.json(
        {
          error: 'QR decode library not available',
          message: 'Install dependencies: npm install jimp qrcode-reader',
          details: decodeError instanceof Error ? decodeError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('QR decode error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
