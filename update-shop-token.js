
import mongoose from 'mongoose';
import Shop from './server/models/Shop.js';

async function updateToken() {
    await mongoose.connect('mongodb://localhost:27017/synx-connect');

    const domain = 'develops-test-store.myshopify.com';
    const token = '';

    console.log(`Updating token for ${domain}...`);

    const shop = await Shop.findOne({ domain });

    if (!shop) {
        console.log('Shop not found! Creating it...');
        await Shop.create({
            domain,
            name: 'Development Test Store',
            accessToken: token,
            isActive: true,
            scopes: ['write_products', 'read_products'],
        });
    } else {
        shop.accessToken = token;
        await shop.save();
        console.log('Token updated successfully.');
    }

    await mongoose.disconnect();
}

updateToken().catch(console.error);
