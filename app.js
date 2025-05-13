// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Models (ensure these files exist in your project)
const Event = require('./event');
const User = require('./user');
const Att = require('./att');

// File upload setup using multer
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE']
  }
});
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization; // Expected format: 'Bearer YOUR_TOKEN'
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];  
  if (!token) {
    return res.status(401).json({ error: 'Malformed token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Ensure the token payload includes an isAdmin property set to true
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    
    req.user = decoded; // Optionally attach user data to the request
    next();
  });
};
io.on('connection', (socket) => {
  console.log('New client connected: ' + socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
  });
});
app.get("/",(req,res)=>{
  res.send("hi")});
app.post('/api/events', authenticateAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, date, description, userId, imageLink } = req.body;
    let imageUrl = '';

    // Check if an image is uploaded via multipart form-data
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    } else if (imageLink) { 
      imageUrl = imageLink;
    } else {
      return res.status(400).json({ message: 'Image is required (either by upload or URL)' });
    }

    // Generate a unique id for the new event (assuming uuidv4 is imported)
    const uid = uuidv4();

    // Create the new event instance (assuming Event is your Mongoose model)
    const newEvent = new Event({
      uid,
      title,
      date,
      description,
      imageUrl,
    });

    // Save the event in the database
    await newEvent.save();

    res.status(201).json(newEvent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

let activeEvent = null;
app.post('/create-event', authenticateAdmin, (req, res) => {
  const { title, wifiSSID } = req.body;
  
  if (!title || !wifiSSID) {
    return res.status(400).json({ error: 'Missing title or wifiSSID' });
  }

  const activeEvent = {
    title: title,
    wifiSSID: wifiSSID,
    date: new Date().toISOString(),
  };
  io.emit('event-created', activeEvent);
  res.json({ success: true, event: activeEvent });
});


app.get('/api/active-event', (req, res) => {
  res.json(activeEvent);
});
app.post('/admin/login', async (req, res) => {
  res.send(req.body)
  try {
    const { passcode } = req.body;
    res.send(req.body)
    res.send(process.env.ADMIN_PASSCODE)
    // Compare the provided passcode with the one stored in the environment
    if (passcode === process.env.ADMIN_PASSCODE) {
      res.send("ll")
      // Generate JWT payload. You can add more data here if needed.
      const payload = { name: 'Admin', isAdmin: true };
      // Sign the token using a secret from your environment (e.g., process.env.JWT_SECRET)
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
      
      // Send the token to the client along with a success message
      return res.status(200).json({ success: true, message: 'Access Granted', token });
    } else {
      return res.status(401).json({ success: false, message: 'Access Denied' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
});
// 3. Get all events from the database
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find();
    res.status(200).json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// 4. Add new user (if not already added)
app.post('/add-user', async (req, res) => {
  const { email,name } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email, userName:name });
      await user.save();
      return res.status(201).json({ message: 'User added successfully' });
    }
    res.status(200).json({ message: 'User already exists' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 5. Get currently active event (for attendance)
app.get('/get-active-event', (req, res) => {
  res.json(activeEvent || {});
});

// 6. Delete active event
app.delete('/delete-event', (req, res) => {
  activeEvent = null;
  io.emit('event-deleted');
  res.json({ success: true });
});

app.post('/api/attend', async (req, res) => {
  const { userId, eventId } = req.body;
  if (!userId || !eventId) {
    return res.status(400).json({ message: 'Missing userId or eventId' });
  }
  try {
    const user = await User.findOne({ email: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.events.includes(eventId)) {
      user.events.push(eventId);
      await user.save();
    }
    
    return res.status(200).json({ message: 'Attendance marked successfully', events: user.events });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

app.get('/get-user', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ message: 'Missing email' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find(); // fetch all users
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
