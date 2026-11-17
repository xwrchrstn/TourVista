// Load the marketplace theme after the common application styles.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './marketplace.css';
import './capstone.css';
import './experience.css';
import './tourist.css';

createRoot(document.getElementById('root')).render(<App />);
