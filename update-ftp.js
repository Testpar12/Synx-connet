import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Shop from './server/models/Shop.js';
import FtpConnection from './server/models/FtpConnection.js';
import encryption from './server/utils/encryption.js';

dotenv.config();

async function updateFtpConnection() {
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

        // Delete existing Production FTP Server
        const deleted = await FtpConnection.deleteOne({
            shop: shop._id,
            name: 'Production FTP Server',
        });

        if (deleted.deletedCount > 0) {
            console.log('✅ Deleted existing Production FTP Server');
        }

        // Create Production FTP Server with real credentials
        const ftpConnection = new FtpConnection({
            shop: shop._id,
            name: 'Production FTP Server',
            protocol: 'ftp',
            host: '157.173.209.190',
            port: 21,
            username: 'u187542474.bryanftp',
            password: encryption.encrypt('!@#Bryanftp!@#45'),
            rootPath: '/',
            status: 'inactive',
            isActive: true,
        });

        await ftpConnection.save();
        console.log('✅ Production FTP Server created successfully!');
        console.log(`   Name: ${ftpConnection.name}`);
        console.log(`   Host: ${ftpConnection.host}`);
        console.log(`   Port: ${ftpConnection.port}`);
        console.log(`   Username: ${ftpConnection.username}`);
        console.log(`   Protocol: ${ftpConnection.protocol}`);

        process.exit(0);
    } catch (error) {
        console.error('Error updating FTP connection:', error);
        process.exit(1);
    }
}

updateFtpConnection();
