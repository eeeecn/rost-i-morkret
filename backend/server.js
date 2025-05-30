const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Anslut till MongoDB
mongoose.connect('mongodb://localhost:27017/rostimorkret', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Ansluten till MongoDB'));

// Schema för framsteg
const progressSchema = new mongoose.Schema({
  userId: String,
  role: String,
  storySegment: Number,
  timestamp: { type: Date, default: Date.now },
});

// Schema för berättelser
const storySchema = new mongoose.Schema({
  storyId: String,
  title: String,
  role: String,
  segments: [{
    segmentId: Number,
    audioUrl: String,
    trigger: {
      distance: Number,
      direction: String // t.ex. "north", "south"
    }
  }]
});

const Progress = mongoose.model('Progress', progressSchema);
const Story = mongoose.model('Story', storySchema);

// Spara framsteg
app.post('/api/progress', async (req, res) => {
  try {
    const { userId, role, storySegment } = req.body;
    const progress = new Progress({ userId, role, storySegment });
    await progress.save();
    res.status(200).send('Framsteg sparade');
  } catch (err) {
    res.status(500).send('Fel vid sparande av framsteg');
  }
});

// Hämta framsteg
app.get('/api/progress/:userId', async (req, res) => {
  try {
    const progress = await Progress.findOne({ userId: req.params.userId }).sort({ timestamp: -1 });
    res.status(200).json(progress);
  } catch (err) {
    res.status(500).send('Fel vid hämtning av framsteg');
  }
});

// Hämta berättelse
app.get('/api/story/:storyId/:role', async (req, res) => {
  try {
    const story = await Story.findOne({ storyId: req.params.storyId, role: req.params.role });
    res.status(200).json(story);
  } catch (err) {
    res.status(500).send('Fel vid hämtning av berättelse');
  }
});

// Lägg till berättelse (för admin/test)
app.post('/api/story', async (req, res) => {
  try {
    const { storyId, title, role, segments } = req.body;
    const story = new Story({ storyId, title, role, segments });
    await story.save();
    res.status(200).send('Berättelse tillagd');
  } catch (err) {
    res.status(500).send('Fel vid tillägg av berättelse');
  }
});

app.listen(3000, () => console.log('Server kör på port 3000'));
