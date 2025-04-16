// event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
 
  title: { type: String },
  date: { type: String },
  description: { type: String },
  imageUrl: { type: String },
});

module.exports = mongoose.model('Event', EventSchema);
