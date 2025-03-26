const videoPlayer = document.getElementById('videoPlayer');
const loadingSpinner = document.getElementById('loadingSpinner');
const prevBtn = document.getElementById('prevBtn');
const randomBtn = document.getElementById('randomBtn');
const nextBtn = document.getElementById('nextBtn');
let currentVideoData = null;


async function fetchRandomVideo() {
  loadingSpinner.style.display = 'flex';
  try {
    const response = await fetch('/api/video/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to fetch video');
    const data = await response.json();
    updateVideo(data);
  } catch (error) {
    console.error('Error fetching random video:', error);
  } finally {
    loadingSpinner.style.display = 'none';
  }
}


async function fetchVideoById(id) {
  loadingSpinner.style.display = 'flex';
  try {
    const response = await fetch('/api/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error('Failed to fetch video');
    const data = await response.json();
    updateVideo(data);
  } catch (error) {
    console.error('Error fetching video:', error);
  } finally {
    loadingSpinner.style.display = 'none';
  }
}

function updateVideo(data) {
  currentVideoData = data;
  videoPlayer.style.opacity = 0;
  videoPlayer.src = data.current.embedUrl;
  videoPlayer.onload = () => {
    videoPlayer.style.opacity = 1;
  };
  prevBtn.disabled = !data.prevId;
  nextBtn.disabled = !data.nextId;
}

prevBtn.addEventListener('click', () => {
  if (currentVideoData && currentVideoData.prevId) fetchVideoById(currentVideoData.prevId);
});

nextBtn.addEventListener('click', () => {
  if (currentVideoData && currentVideoData.nextId) fetchVideoById(currentVideoData.nextId);
});

randomBtn.addEventListener('click', fetchRandomVideo);


fetchRandomVideo();
