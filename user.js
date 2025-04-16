const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userName:{type:String},
  email: { type: String, required: true, unique: true },
  events: [{ type: String }] // array of event IDs or titles
});

module.exports = mongoose.model('User', userSchema);
