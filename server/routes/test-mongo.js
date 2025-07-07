import mongoose from 'mongoose';

const uri = 'mongodb+srv://daniyalkhawar5:newpass123@cluster0.26xrh.mongodb.net/CIVCHANGE?retryWrites=true&w=majority';

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
  });