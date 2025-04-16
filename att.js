const mongoose = require('mongoose');

// Define Mongoose Schema for Attendance Event
const AttendanceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  wifiSSID: { type: String, required: true },
  isActive: { type: Boolean, default: true },
});

// Create and export the Event model
const Event = mongoose.model('AttendanceEvent', AttendanceSchema);
module.exports = Event;
