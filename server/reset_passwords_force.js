const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const resetPasswords = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const usersToReset = ['scy@expo.com', 'it@expo.com', 'noc@expo.com', 'superadmin@expo.com'];

    for (const email of usersToReset) {
      const user = await User.findOne({ email });
      if (user) {
        user.password = hashedPassword;
        await user.save();
        console.log(`Password reset for ${email} to 'admin123'`);
      } else {
        console.log(`User ${email} not found, skipping.`);
      }
    }

    console.log('Password reset process complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting passwords:', error);
    process.exit(1);
  }
};

resetPasswords();
