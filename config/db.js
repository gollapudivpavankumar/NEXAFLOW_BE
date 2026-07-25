import mongoose from 'mongoose';

// NOTE: This machine's DNS server refuses Node's c-ares SRV/TXT queries
// (`mongodb+srv://` fails with querySrv ECONNREFUSED), even though the OS
// resolver works. Using the STANDARD seed-list connection string avoids the
// SRV lookup entirely — the driver resolves each host via getaddrinfo, which
// works here and on Railway. Override with the MONGODB_URI env var if needed.
const SRV_URI = 'mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr';
const SEED_URI = 'mongodb://pavankumarandroid_db_user:vKnOusM66BEV39j5@' +
  'ac-vhyxduh-shard-00-00.zgd2rme.mongodb.net:27017,' +
  'ac-vhyxduh-shard-00-01.zgd2rme.mongodb.net:27017,' +
  'ac-vhyxduh-shard-00-02.zgd2rme.mongodb.net:27017/' +
  '?ssl=true&replicaSet=atlas-7ibks3-shard-0&authSource=admin&retryWrites=true&w=majority&appName=spxpr';

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || SEED_URI;
  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Fall back to the SRV URI in case the seed hosts ever rotate and an
    // environment with working SRV DNS is available.
    if (uri !== SRV_URI) {
      try {
        console.log('Retrying with SRV connection string...');
        const conn = await mongoose.connect(SRV_URI);
        console.log(`MongoDB Connected (SRV): ${conn.connection.host}`);
        return;
      } catch (srvError) {
        console.error(`SRV fallback also failed: ${srvError.message}`);
      }
    }
    process.exit(1);
  }
};

export default connectDB;
