# Canva to PSD Converter Micro-SaaS

A web-based service that converts Canva designs (exported as PDF) to Photoshop PSD files with preserved layers using Photopea's conversion engine.

## Features

- **PDF to PSD Conversion**: Convert Canva PDF exports to Photoshop PSD files
- **Layer Preservation**: Maintains text layers, images, and basic shapes
- **Real-time Progress**: Live progress tracking during conversion
- **Drag & Drop Upload**: Easy file upload interface
- **WebSocket Updates**: Real-time status updates during conversion
- **File Size Limits**: 50MB maximum file size
- **Modern UI**: Clean, responsive design with Tailwind CSS

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Dropzone for file uploads
- Socket.io-client for real-time updates
- React Hot Toast for notifications
- Lucide React for icons

### Backend
- Node.js with Express
- Socket.io for WebSocket communication
- Puppeteer for browser automation
- Multer for file upload handling
- CORS enabled for cross-origin requests

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Chrome/Chromium browser (for Puppeteer)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   # Terminal 1: Start the backend server
   npm run server
   
   # Terminal 2: Start the frontend development server
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

## Usage

1. **Export from Canva**: Export your Canva design as a PDF file
2. **Upload PDF**: Drag and drop or click to upload your PDF file
3. **Wait for Conversion**: The system will automatically convert your PDF to PSD
4. **Download PSD**: Once complete, download your PSD file ready for Photoshop

## How It Works

### Conversion Pipeline

1. **File Upload**: User uploads a PDF file (max 50MB)
2. **Server Processing**: Backend stores the file and creates a conversion job
3. **Photopea Integration**: Puppeteer launches a headless browser and navigates to Photopea
4. **PDF Loading**: The PDF is loaded into Photopea's web-based Photoshop alternative
5. **PSD Export**: Photopea exports the design as a PSD file
6. **File Delivery**: The converted PSD is made available for download

### Technical Details

- **Photopea Engine**: Uses Photopea's web-based Photoshop engine for conversion
- **Layer Preservation**: Maintains text layers, images, and basic shapes
- **Real-time Updates**: WebSocket communication provides live progress updates
- **Error Handling**: Comprehensive error handling for failed conversions
- **File Cleanup**: Automatic cleanup of temporary files

## API Endpoints

### POST /api/upload
Upload a PDF file for conversion.

**Request**: Multipart form data with PDF file
**Response**: 
```json
{
  "jobId": "uuid",
  "message": "File uploaded successfully",
  "fileName": "original-filename.pdf"
}
```

### POST /api/convert
Start the conversion process for a job.

**Request**: 
```json
{
  "jobId": "uuid"
}
```

### GET /api/job/:jobId
Get the status of a conversion job.

**Response**:
```json
{
  "jobId": "uuid",
  "status": "completed",
  "progress": 100,
  "fileName": "converted.psd",
  "downloadUrl": "/downloads/filename.psd"
}
```

## WebSocket Events

### conversion-progress
Real-time progress updates during conversion.

```json
{
  "jobId": "uuid",
  "status": "pdf_processed",
  "progress": 60,
  "fileName": "filename.pdf",
  "downloadUrl": "/downloads/filename.psd"
}
```

## Development

### Project Structure
```
project/
├── src/
│   ├── components/
│   │   ├── Converter.tsx      # Main converter component
│   │   └── ...                # Other UI components
│   ├── services/
│   │   └── api.ts            # API service functions
│   └── App.tsx               # Main app component
├── server/
│   └── index.js              # Backend server
├── uploads/                  # Temporary PDF storage
├── downloads/                # Converted PSD files
└── package.json
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3001
NODE_ENV=development
```

### Scripts

- `npm run dev`: Start frontend development server
- `npm run server`: Start backend server
- `npm run build`: Build for production
- `npm run preview`: Preview production build

## Limitations

- **File Size**: Maximum 50MB PDF files
- **Complex Effects**: Some Canva effects may not convert perfectly
- **Fonts**: Custom fonts may not be preserved
- **Advanced Features**: Complex Canva features may require manual adjustment

## Future Enhancements

- [ ] Canva API integration for direct import
- [ ] Batch processing for multiple files
- [ ] Advanced layer optimization
- [ ] Custom PSD export options
- [ ] User authentication and file history
- [ ] Premium features and pricing tiers

## Troubleshooting

### Common Issues

1. **Conversion Fails**: Check file size and ensure it's a valid PDF
2. **Server Won't Start**: Ensure port 3001 is available
3. **Puppeteer Issues**: Install Chrome/Chromium browser
4. **File Upload Errors**: Check file type and size limits

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` in your environment.

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please open an issue on GitHub or contact the development team. 