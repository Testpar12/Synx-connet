import mongoose from 'mongoose';
import Shop from './server/models/Shop.js';

// The Atlas URI provided by the user earlier
const uri = "mongodb+srv://par-test24_db:Par_test249724226506@cluster0.kdftf2k.mongodb.net/?appName=Cluster0";

async function checkShop() {
    try {
        console.log("Connecting to Atlas...");
        await mongoose.connect(uri);
        console.log("Connected.");

        const shopDomain = 'develops-test-store.myshopify.com';
        console.log(`Searching for shop: ${shopDomain}`);

        const shop = await Shop.findOne({ domain: shopDomain });

        if (shop) {
            console.log("✅ Shop FOUND in DB!");
            console.log("ID:", shop._id);
            console.log("Is Active:", shop.isActive);
            console.log("Access Token:", shop.accessToken ? (shop.accessToken.substring(0, 10) + "...") : "MISSING");
            console.log("Scopes:", shop.scopes);
        } else {
            console.log("❌ Shop NOT FOUND in DB.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

checkShop();
