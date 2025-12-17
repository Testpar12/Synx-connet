
import mongoose from 'mongoose';
import Feed from './server/models/Feed.js';

async function checkFeedConfig() {
    await mongoose.connect('mongodb://localhost:27017/synx-connect');

    const feedId = '69411f23ce9859275fa031ef';
    const feed = await Feed.findById(feedId);

    if (feed) {
        console.log('Feed Options:', feed.options);
    } else {
        console.log('Feed not found');
    }

    await mongoose.disconnect();
}

checkFeedConfig().catch(console.error);
