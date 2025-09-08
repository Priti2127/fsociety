import mongoose from 'mongoose';

export const connectDB = async (): Promise<boolean> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/task-manager';
    
    const conn = await mongoose.connect(mongoURI, {
      // Remove deprecated options for newer mongoose versions
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });

    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.log('⚠️ Server will continue without database functionality');
    return false;
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('📦 MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
  }
};
