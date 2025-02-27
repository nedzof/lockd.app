# Supported Image Formats in Lockd.app

Lockd.app now supports a wide range of image formats for post creation. This document outlines the supported formats and provides guidance for users and developers.

## Supported Image Formats

The following image formats are supported for uploading with posts:

| Format | MIME Type | Description |
|--------|-----------|-------------|
| JPEG | `image/jpeg`, `image/jpg` | Common format for photos with lossy compression |
| PNG | `image/png` | Lossless format with transparency support |
| GIF | `image/gif` | Format supporting animations |
| BMP | `image/bmp` | Uncompressed bitmap format |
| SVG | `image/svg+xml` | Vector graphics format |
| WebP | `image/webp` | Modern format with efficient compression |
| TIFF | `image/tiff` | High-quality format often used in photography |

## Size Limitations

- Maximum file size: 5MB
- Images larger than 800px in either dimension will be automatically resized while maintaining aspect ratio

## Technical Implementation

The image upload functionality has been implemented with the following considerations:

1. **Client-side validation**:
   - File input accepts specific MIME types
   - JavaScript validation checks file type and size
   - Helpful error messages guide users when invalid formats are selected

2. **Server-side validation**:
   - API endpoints validate image formats before processing
   - Proper MIME type handling for serving images
   - Conversion to web-compatible formats when necessary

3. **Image processing**:
   - Images are processed to ensure optimal size and format
   - SVG and other vector formats are preserved
   - Non-web formats are converted to PNG for compatibility

## Developer Notes

When working with the image upload functionality:

- Always check for supported formats using the validation helpers
- Use the `processImage` function to handle image resizing and format conversion
- The `media_type` field in the database stores the MIME type of the image
- The `image_format` field stores the original format name

## Future Enhancements

Planned improvements for image handling:

- Support for additional formats (AVIF, HEIF)
- Better compression options
- Client-side image optimization
- Image editing features
