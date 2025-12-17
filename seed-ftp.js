import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Shop from './server/models/Shop.js';
import FtpConnection from './server/models/FtpConnection.js';
import encryption from './server/utils/encryption.js';

dotenv.config();

async function seedFtpConnection() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find the dev shop
        const shop = await Shop.findOne({ domain: 'dev-shop.myshopify.com' });

        if (!shop) {
            console.error('Dev shop not found. Please run the app first to create it.');
            process.exit(1);
        }

        console.log(`Found shop: ${shop.domain}`);

        // Check if FTP connection already exists
        const existingConnection = await FtpConnection.findOne({
            shop: shop._id,
            name: 'Sample FTP Connection',
        });

        if (existingConnection) {
            console.log('Sample FTP connection already exists');
            process.exit(0);
        }

        // Create sample FTP connection
        const ftpConnection = new FtpConnection({
            shop: shop._id,
            name: 'Sample FTP Connection',
            protocol: 'sftp',
            host: 'ftp.example.com',
            port: 22,
            username: 'demo_user',
            password: encryption.encrypt('demo_password'),
            rootPath: '/uploads',
            status: 'inactive',
            isActive: true,
        });

        await ftpConnection.save();
        console.log('✅ Sample FTP connection created successfully!');
        console.log(`   Name: ${ftpConnection.name}`);
        console.log(`   Host: ${ftpConnection.host}`);
        console.log(`   Protocol: ${ftpConnection.protocol}`);

        // Create another sample connection
        const ftpConnection2 = new FtpConnection({
            shop: shop._id,
            name: 'Production FTP Server',
            protocol: 'ftp',
            host: '157.173.209.190',
            port: 21,
            username: 'u187542474.bryanftp',
            password: '!@#Bryanftp!@#45',
            rootPath: '/',
            status: 'inactive',
            isActive: true,
        });

        await ftpConnection2.save();
        console.log('✅ Second FTP connection created successfully!');
        console.log(`   Name: ${ftpConnection2.name}`);
        console.log(`   Host: ${ftpConnection2.host}`);
        console.log(`   Protocol: ${ftpConnection2.protocol}`);

        process.exit(0);
    } catch (error) {
        console.error('Error seeding FTP connection:', error);
        process.exit(1);
    }
}

seedFtpConnection();
