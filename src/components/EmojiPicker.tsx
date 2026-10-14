import React, { useState, useMemo } from 'react';
import { Search, Smile, Heart, Leaf, Coffee, Trophy, MapPin, Package, HeartHandshake } from 'lucide-react';

interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: any;
  emojis: EmojiItem[];
}

const EMOJI_CATALOG: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: Smile,
    emojis: [
      { emoji: '😀', name: 'Grinning Face', keywords: ['happy', 'joy', 'smile', 'cheerful', 'grinning'] },
      { emoji: '😃', name: 'Grinning Face with Big Eyes', keywords: ['happy', 'joy', 'smile', 'excited'] },
      { emoji: '😄', name: 'Grinning Face with Smiling Eyes', keywords: ['happy', 'joy', 'smile', 'laugh'] },
      { emoji: '😁', name: 'Beaming Face with Smiling Eyes', keywords: ['happy', 'joy', 'smile', 'grin'] },
      { emoji: '😆', name: 'Squinting Grinning Face', keywords: ['happy', 'laugh', 'lol', 'smile'] },
      { emoji: '😅', name: 'Grinning Face with Sweat', keywords: ['sweat', 'nervous', 'happy', 'laugh', 'relief'] },
      { emoji: '😂', name: 'Face with Tears of Joy', keywords: ['funny', 'lol', 'laugh', 'tears', 'crying'] },
      { emoji: '🤣', name: 'Rolling on the Floor Laughing', keywords: ['funny', 'lol', 'laugh', 'rofl'] },
      { emoji: '😊', name: 'Smiling Face with Smiling Eyes', keywords: ['happy', 'blush', 'warm', 'cute'] },
      { emoji: '😇', name: 'Smiling Face with Halo', keywords: ['angel', 'innocent', 'good', 'sweet'] },
      { emoji: '🙂', name: 'Slightly Smiling Face', keywords: ['smile', 'warm', 'ok'] },
      { emoji: '🙃', name: 'Upside-Down Face', keywords: ['silly', 'sarcastic', 'flip'] },
      { emoji: '😉', name: 'Winking Face', keywords: ['wink', 'flirt', 'joke'] },
      { emoji: '😌', name: 'Relieved Face', keywords: ['relieved', 'calm', 'peaceful'] },
      { emoji: '😍', name: 'Smiling Face with Heart-Eyes', keywords: ['love', 'heart', 'adore', 'romantic'] },
      { emoji: '🥰', name: 'Smiling Face with Hearts', keywords: ['love', 'affection', 'warm', 'adore'] },
      { emoji: '😘', name: 'Face Blowing a Kiss', keywords: ['kiss', 'love', 'muah', 'flirt'] },
      { emoji: '😋', name: 'Face Savoring Food', keywords: ['yum', 'delicious', 'delicious', 'hungry'] },
      { emoji: '😛', name: 'Face with Tongue', keywords: ['silly', 'joke', 'playful'] },
      { emoji: '😜', name: 'Winking Face with Tongue', keywords: ['wink', 'silly', 'playful', 'joke'] },
      { emoji: '🤪', name: 'Zany Face', keywords: ['crazy', 'silly', 'goofy', 'fun'] },
      { emoji: '🤨', name: 'Face with Raised Eyebrow', keywords: ['suspicious', 'hmm', 'skeptical', 'think'] },
      { emoji: '🧐', name: 'Face with Monocle', keywords: ['smart', 'inspect', 'curious', 'examine'] },
      { emoji: '🤓', name: 'Nerd Face', keywords: ['nerd', 'geek', 'smart', 'glasses'] },
      { emoji: '😎', name: 'Smiling Face with Sunglasses', keywords: ['cool', 'chill', 'sunglasses', 'confident'] },
      { emoji: '🥸', name: 'Disguised Face', keywords: ['disguise', 'mask', 'incognito', 'hide'] },
      { emoji: '🤩', name: 'Star-Struck', keywords: ['star', 'excited', 'amazing', 'wow'] },
      { emoji: '🥳', name: 'Partying Face', keywords: ['party', 'celebrate', 'birthday', 'woohoo'] },
      { emoji: '😏', name: 'Smirking Face', keywords: ['smirk', 'sly', 'flirt', 'confident'] },
      { emoji: '😒', name: 'Unamused Face', keywords: ['bored', 'meh', 'unamused', 'disappointed'] },
      { emoji: '😞', name: 'Disappointed Face', keywords: ['sad', 'unhappy', 'disappointed'] },
      { emoji: '😔', name: 'Pensive Face', keywords: ['sad', 'thoughtful', 'unhappy'] },
      { emoji: '😟', name: 'Worried Face', keywords: ['worry', 'scared', 'anxious'] },
      { emoji: '😕', name: 'Confused Face', keywords: ['confused', 'huh', 'uncertain'] },
      { emoji: '🥺', name: 'Pleading Face', keywords: ['plead', 'beg', 'cute', 'eyes', 'puppy'] },
      { emoji: '😢', name: 'Crying Face', keywords: ['sad', 'cry', 'tear', 'hurt'] },
      { emoji: '😭', name: 'Loudly Crying Face', keywords: ['cry', 'sob', 'sad', 'tears', 'hurt'] },
      { emoji: '😤', name: 'Face with Steam from Nose', keywords: ['angry', 'frustrated', 'triumph', 'mad'] },
      { emoji: '😠', name: 'Angry Face', keywords: ['angry', 'mad', 'frustrated', 'frown'] },
      { emoji: '😡', name: 'Pouting Face', keywords: ['angry', 'mad', 'pout', 'rage'] },
      { emoji: '🤬', name: 'Face with Symbols on Mouth', keywords: ['angry', 'cuss', 'swear', 'mad', 'rage'] },
      { emoji: '🤯', name: 'Exploding Head', keywords: ['mindblown', 'wow', 'crazy', 'shock'] },
      { emoji: '😳', name: 'Flushed Face', keywords: ['shocked', 'embarrassed', 'blush', 'surprised'] },
      { emoji: '🥵', name: 'Hot Face', keywords: ['hot', 'sweat', 'summer', 'spicy'] },
      { emoji: '🥶', name: 'Cold Face', keywords: ['cold', 'freeze', 'winter', 'ice'] },
      { emoji: '😱', name: 'Face Screaming in Fear', keywords: ['scared', 'shock', 'scream', 'fear'] },
      { emoji: '😴', name: 'Sleeping Face', keywords: ['sleep', 'tired', 'zzz', 'night'] },
      { emoji: '🤤', name: 'Drooling Face', keywords: ['drool', 'delicious', 'asleep'] },
      { emoji: '😵', name: 'Knocked-Out Face', keywords: ['dizzy', 'dead', 'shock', 'knockedout'] },
      { emoji: '🤢', name: 'Nauseated Face', keywords: ['sick', 'gross', 'vomit', 'green'] },
      { emoji: '🤮', name: 'Face Vomiting', keywords: ['sick', 'vomit', 'gross', 'puke'] },
      { emoji: '🤑', name: 'Money-Mouth Face', keywords: ['money', 'rich', 'cash', 'dollar'] },
      { emoji: '😈', name: 'Smiling Face with Horns', keywords: ['devil', 'evil', 'mischievous', 'horns'] },
      { emoji: '👿', name: 'Angry Face with Horns', keywords: ['devil', 'angry', 'horns', 'evil'] },
      { emoji: '💀', name: 'Skull', keywords: ['dead', 'funny', 'skeleton', 'laugh'] },
      { emoji: '💩', name: 'Pile of Poop', keywords: ['poop', 'funny', 'pile'] },
      { emoji: '👻', name: 'Ghost', keywords: ['ghost', 'spooky', 'halloween', 'scary'] },
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures & Body',
    icon: HeartHandshake,
    emojis: [
      { emoji: '👋', name: 'Waving Hand', keywords: ['wave', 'hello', 'goodbye', 'hi'] },
      { emoji: '🤚', name: 'Raised Back of Hand', keywords: ['hand', 'back', 'raised'] },
      { emoji: '✋', name: 'Raised Hand', keywords: ['stop', 'highfive', 'hand'] },
      { emoji: '👌', name: 'OK Hand', keywords: ['ok', 'fine', 'good', 'perfect'] },
      { emoji: '🤌', name: 'Pinched Fingers', keywords: ['italian', 'gesture', 'what'] },
      { emoji: '✌️', name: 'Victory Hand', keywords: ['peace', 'victory', 'two'] },
      { emoji: '🤞', name: 'Crossed Fingers', keywords: ['luck', 'cross', 'hope'] },
      { emoji: '🤟', name: 'Love-You Gesture', keywords: ['love', 'ily', 'metal'] },
      { emoji: '🤘', name: 'Sign of the Horns', keywords: ['metal', 'rock', 'horns'] },
      { emoji: '🤙', name: 'Call Me Hand', keywords: ['call', 'phone', 'hangloose'] },
      { emoji: '👍', name: 'Thumbs Up', keywords: ['like', 'yes', 'good', 'approve', 'agree'] },
      { emoji: '👎', name: 'Thumbs Down', keywords: ['dislike', 'no', 'bad', 'disapprove'] },
      { emoji: '👊', name: 'Oncoming Fist', keywords: ['fist', 'punch', 'fistbump'] },
      { emoji: '👏', name: 'Clapping Hands', keywords: ['clap', 'applause', 'goodjob', 'bravo'] },
      { emoji: '🙌', name: 'Raising Hands', keywords: ['celebrate', 'praise', 'hooray'] },
      { emoji: '👐', name: 'Open Hands', keywords: ['hands', 'open', 'hug'] },
      { emoji: '🤲', name: 'Palms Up Together', keywords: ['pray', 'offer', 'hands'] },
      { emoji: '🤝', name: 'Handshake', keywords: ['agreement', 'shake', 'deal', 'trust'] },
      { emoji: '🙏', name: 'Folded Hands', keywords: ['please', 'thankyou', 'pray', 'hope'] },
      { emoji: '💪', name: 'Flexed Biceps', keywords: ['strong', 'power', 'muscle', 'gym'] },
      { emoji: '🧠', name: 'Brain', keywords: ['brain', 'smart', 'mind', 'think'] },
      { emoji: '👀', name: 'Eyes', keywords: ['eyes', 'look', 'see', 'watching'] },
    ],
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    icon: Leaf,
    emojis: [
      { emoji: '🐶', name: 'Dog Face', keywords: ['dog', 'puppy', 'pet', 'animal'] },
      { emoji: '🐱', name: 'Cat Face', keywords: ['cat', 'kitten', 'pet', 'meow'] },
      { emoji: '🐭', name: 'Mouse Face', keywords: ['mouse', 'animal', 'cute'] },
      { emoji: '🐹', name: 'Hamster', keywords: ['hamster', 'cute', 'pet'] },
      { emoji: '🐰', name: 'Rabbit Face', keywords: ['rabbit', 'bunny', 'cute', 'pet'] },
      { emoji: '🦊', name: 'Fox', keywords: ['fox', 'animal', 'sly'] },
      { emoji: '🐻', name: 'Bear', keywords: ['bear', 'animal', 'wild'] },
      { emoji: '🐼', name: 'Panda', keywords: ['panda', 'animal', 'cute'] },
      { emoji: '🐨', name: 'Koala', keywords: ['koala', 'cute', 'australia'] },
      { emoji: '🦁', name: 'Lion', keywords: ['lion', 'king', 'wild', 'cat'] },
      { emoji: '🐮', name: 'Cow Face', keywords: ['cow', 'farm', 'animal'] },
      { emoji: '🐷', name: 'Pig Face', keywords: ['pig', 'farm', 'oink'] },
      { emoji: '🐸', name: 'Frog', keywords: ['frog', 'toad', 'green'] },
      { emoji: '🐵', name: 'Monkey Face', keywords: ['monkey', 'banana', 'chimp'] },
      { emoji: '🐔', name: 'Chicken', keywords: ['chicken', 'rooster', 'cluck'] },
      { emoji: '🐧', name: 'Penguin', keywords: ['penguin', 'bird', 'cold'] },
      { emoji: '🐦', name: 'Bird', keywords: ['bird', 'fly', 'nature'] },
      { emoji: '🐤', name: 'Baby Chick', keywords: ['chicken', 'baby', 'cute', 'bird'] },
      { emoji: '🐝', name: 'Honeybee', keywords: ['bee', 'honey', 'buzz', 'insect'] },
      { emoji: '🦋', name: 'Butterfly', keywords: ['butterfly', 'insect', 'wings', 'pretty'] },
      { emoji: '🐢', name: 'Turtle', keywords: ['turtle', 'slow', 'ocean'] },
      { emoji: '🐙', name: 'Octopus', keywords: ['octopus', 'squid', 'ocean'] },
      { emoji: '🐬', name: 'Dolphin', keywords: ['dolphin', 'ocean', 'swim'] },
      { emoji: '🐳', name: 'Spouting Whale', keywords: ['whale', 'ocean', 'water'] },
      { emoji: '🌲', name: 'Evergreen Tree', keywords: ['tree', 'forest', 'pine', 'nature'] },
      { emoji: '🌳', name: 'Deciduous Tree', keywords: ['tree', 'park', 'nature'] },
      { emoji: '🌴', name: 'Palm Tree', keywords: ['palm', 'beach', 'tropical'] },
      { emoji: '🌵', name: 'Cactus', keywords: ['cactus', 'desert', 'spike'] },
      { emoji: '🍀', name: 'Four Leaf Clover', keywords: ['clover', 'luck', 'irish', 'green'] },
      { emoji: '🍁', name: 'Maple Leaf', keywords: ['leaf', 'fall', 'canada', 'autumn'] },
      { emoji: '🍂', name: 'Fallen Leaf', keywords: ['leaf', 'fall', 'autumn'] },
      { emoji: '🍃', name: 'Leaf Fluttering in Wind', keywords: ['leaf', 'wind', 'nature', 'breeze'] },
      { emoji: '🍄', name: 'Mushroom', keywords: ['mushroom', 'fungi', 'toadstool'] },
      { emoji: '🌸', name: 'Cherry Blossom', keywords: ['blossom', 'flower', 'pink', 'spring'] },
      { emoji: '🌹', name: 'Rose', keywords: ['rose', 'flower', 'love', 'red'] },
      { emoji: '🌻', name: 'Sunflower', keywords: ['sunflower', 'flower', 'yellow', 'summer'] },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: Coffee,
    emojis: [
      { emoji: '🍏', name: 'Green Apple', keywords: ['apple', 'fruit', 'healthy'] },
      { emoji: '🍎', name: 'Red Apple', keywords: ['apple', 'fruit', 'red'] },
      { emoji: '🍊', name: 'Tangerine', keywords: ['orange', 'citrus', 'fruit'] },
      { emoji: '🍋', name: 'Lemon', keywords: ['lemon', 'sour', 'citrus', 'fruit'] },
      { emoji: '🍌', name: 'Banana', keywords: ['banana', 'fruit', 'yellow'] },
      { emoji: '🍉', name: 'Watermelon', keywords: ['watermelon', 'fruit', 'summer'] },
      { emoji: '🍇', name: 'Grapes', keywords: ['grapes', 'fruit', 'wine'] },
      { emoji: '🍓', name: 'Strawberry', keywords: ['strawberry', 'fruit', 'berry'] },
      { emoji: '🍒', name: 'Cherries', keywords: ['cherry', 'fruit', 'berries'] },
      { emoji: '🍍', name: 'Pineapple', keywords: ['pineapple', 'fruit', 'tropical'] },
      { emoji: '🥑', name: 'Avocado', keywords: ['avocado', 'guac', 'healthy'] },
      { emoji: '🍔', name: 'Burger', keywords: ['burger', 'food', 'fastfood', 'beef'] },
      { emoji: '🍟', name: 'French Fries', keywords: ['fries', 'fastfood', 'potato'] },
      { emoji: '🍕', name: 'Pizza', keywords: ['pizza', 'cheese', 'italian', 'slice'] },
      { emoji: '🌮', name: 'Taco', keywords: ['taco', 'mexican', 'food'] },
      { emoji: '🍳', name: 'Cooking', keywords: ['egg', 'breakfast', 'fry', 'cook'] },
      { emoji: '🍿', name: 'Popcorn', keywords: ['popcorn', 'movie', 'snack'] },
      { emoji: '🍩', name: 'Donut', keywords: ['donut', 'sweet', 'bakery'] },
      { emoji: '🍪', name: 'Cookie', keywords: ['cookie', 'chocolate', 'sweet', 'biscuit'] },
      { emoji: '🎂', name: 'Birthday Cake', keywords: ['cake', 'birthday', 'celebrate', 'sweet'] },
      { emoji: '🍰', name: 'Shortcake', keywords: ['cake', 'slice', 'strawberry', 'sweet'] },
      { emoji: '🍫', name: 'Chocolate Bar', keywords: ['chocolate', 'candy', 'sweet'] },
      { emoji: '🍬', name: 'Candy', keywords: ['candy', 'sweet', 'sugar'] },
      { emoji: '🍼', name: 'Baby Bottle', keywords: ['baby', 'bottle', 'milk'] },
      { emoji: '🥛', name: 'Glass of Milk', keywords: ['milk', 'glass', 'drink'] },
      { emoji: '☕', name: 'Hot Beverage', keywords: ['coffee', 'tea', 'hot', 'morning', 'cafe'] },
      { emoji: '🍵', name: 'Teacup Without Handle', keywords: ['tea', 'matcha', 'green'] },
      { emoji: '🍺', name: 'Beer Mug', keywords: ['beer', 'cheers', 'drink', 'pub'] },
      { emoji: '🍻', name: 'Clinking Beer Mugs', keywords: ['beers', 'cheers', 'drink', 'pub', 'toast'] },
      { emoji: '🥂', name: 'Clinking Glasses', keywords: ['toast', 'celebrate', 'champagne', 'cheers'] },
      { emoji: '🍷', name: 'Wine Glass', keywords: ['wine', 'glass', 'drink', 'alcohol'] },
      { emoji: '🥤', name: 'Cup with Straw', keywords: ['soda', 'straw', 'cup', 'drink'] },
    ],
  },
  {
    id: 'activity',
    name: 'Activity & Sports',
    icon: Trophy,
    emojis: [
      { emoji: '⚽', name: 'Soccer Ball', keywords: ['soccer', 'football', 'sports', 'ball'] },
      { emoji: '🏀', name: 'Basketball', keywords: ['basketball', 'sports', 'ball'] },
      { emoji: '🏈', name: 'American Football', keywords: ['football', 'sports', 'ball'] },
      { emoji: '⚾', name: 'Baseball', keywords: ['baseball', 'sports', 'ball'] },
      { emoji: '🎾', name: 'Tennis', keywords: ['tennis', 'sports', 'racket', 'ball'] },
      { emoji: '🏐', name: 'Volleyball', keywords: ['volleyball', 'sports', 'ball'] },
      { emoji: '🎱', name: 'Pool 8 Ball', keywords: ['pool', 'billiards', 'eightball'] },
      { emoji: '⛳', name: 'Flag in Hole', keywords: ['golf', 'sports', 'flag'] },
      { emoji: '🏆', name: 'Trophy', keywords: ['trophy', 'win', 'first', 'prize', 'champion'] },
      { emoji: '🥇', name: '1st Place Medal', keywords: ['gold', 'medal', 'first', 'win'] },
      { emoji: '🥈', name: '2nd Place Medal', keywords: ['silver', 'medal', 'second'] },
      { emoji: '🥉', name: '3rd Place Medal', keywords: ['bronze', 'medal', 'third'] },
      { emoji: '🎨', name: 'Artist Palette', keywords: ['art', 'paint', 'artist', 'creative'] },
      { emoji: '🎬', name: 'Clapper Board', keywords: ['movie', 'clapper', 'director', 'film'] },
      { emoji: '🎤', name: 'Microphone', keywords: ['mic', 'sing', 'karaoke', 'voice'] },
      { emoji: '🎧', name: 'Headphone', keywords: ['music', 'headphones', 'audio', 'listening'] },
      { emoji: '🎹', name: 'Musical Keyboard', keywords: ['piano', 'music', 'instrument'] },
      { emoji: '🎸', name: 'Guitar', keywords: ['guitar', 'music', 'instrument', 'rock'] },
      { emoji: '🎯', name: 'Bullseye', keywords: ['target', 'dart', 'bullseye', 'aim'] },
      { emoji: '🎮', name: 'Video Game', keywords: ['gaming', 'game', 'controller', 'play'] },
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    icon: MapPin,
    emojis: [
      { emoji: '🚗', name: 'Automobile', keywords: ['car', 'drive', 'travel'] },
      { emoji: '🚕', name: 'Taxi', keywords: ['taxi', 'cab', 'ride'] },
      { emoji: '🚓', name: 'Police Car', keywords: ['police', 'cop', 'patrol'] },
      { emoji: '🚑', name: 'Ambulance', keywords: ['ambulance', 'medical', 'hospital'] },
      { emoji: '🚒', name: 'Fire Engine', keywords: ['fire', 'engine', 'truck'] },
      { emoji: '🚲', name: 'Bicycle', keywords: ['bike', 'cycle', 'ride'] },
      { emoji: '🚨', name: 'Police Car Light', keywords: ['emergency', 'siren', 'light', 'alert'] },
      { emoji: '⚓', name: 'Anchor', keywords: ['ship', 'navy', 'boat', 'anchor'] },
      { emoji: '⛵', name: 'Sailboat', keywords: ['boat', 'sail', 'sea'] },
      { emoji: '✈️', name: 'Airplane', keywords: ['plane', 'fly', 'travel', 'airport'] },
      { emoji: '🚀', name: 'Rocket', keywords: ['rocket', 'space', 'launch', 'blastoff'] },
      { emoji: '🛸', name: 'UFO', keywords: ['ufo', 'alien', 'spaceship'] },
      { emoji: '⌚', name: 'Watch', keywords: ['time', 'watch', 'clock'] },
      { emoji: '⏰', name: 'Alarm Clock', keywords: ['time', 'alarm', 'wake'] },
      { emoji: '🗺️', name: 'World Map', keywords: ['map', 'travel', 'directions'] },
      { emoji: '🌋', name: 'Volcano', keywords: ['volcano', 'lava', 'fire'] },
      { emoji: '🏕️', name: 'Camping', keywords: ['camp', 'tent', 'outdoors'] },
      { emoji: '🏖️', name: 'Beach with Umbrella', keywords: ['beach', 'umbrella', 'summer', 'vacation'] },
      { emoji: '🏝️', name: 'Desert Island', keywords: ['island', 'beach', 'tropical'] },
      { emoji: '🏢', name: 'Office Building', keywords: ['office', 'building', 'work'] },
      { emoji: '🏯', name: 'Japanese Castle', keywords: ['castle', 'japanese', 'fortress'] },
      { emoji: '🏰', name: 'Castle', keywords: ['castle', 'royal', 'palace'] },
      { emoji: '🎡', name: 'Ferris Wheel', keywords: ['ferris', 'wheel', 'amusementpark'] },
      { emoji: '🎢', name: 'Roller Coaster', keywords: ['coaster', 'roller', 'ride'] },
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: Package,
    emojis: [
      { emoji: '📱', name: 'Mobile Phone', keywords: ['phone', 'mobile', 'smartphone'] },
      { emoji: '💻', name: 'Laptop', keywords: ['laptop', 'computer', 'screen', 'tech'] },
      { emoji: '🖥️', name: 'Desktop Computer', keywords: ['computer', 'desktop', 'pc'] },
      { emoji: '📷', name: 'Camera', keywords: ['camera', 'photo', 'shoot'] },
      { emoji: '📸', name: 'Camera with Flash', keywords: ['camera', 'photo', 'flash'] },
      { emoji: '☎️', name: 'Telephone', keywords: ['phone', 'telephone', 'landline'] },
      { emoji: '🔋', name: 'Battery', keywords: ['battery', 'charge', 'power'] },
      { emoji: '🔌', name: 'Electric Plug', keywords: ['plug', 'electric', 'power'] },
      { emoji: '💡', name: 'Light Bulb', keywords: ['bulb', 'light', 'idea', 'smart'] },
      { emoji: '💰', name: 'Money Bag', keywords: ['money', 'bag', 'rich', 'cash'] },
      { emoji: '💳', name: 'Credit Card', keywords: ['card', 'credit', 'payment', 'money'] },
      { emoji: '💎', name: 'Gem Stone', keywords: ['gem', 'diamond', 'jewel', 'rich'] },
      { emoji: '🛠️', name: 'Hammer and Wrench', keywords: ['tools', 'repair', 'fix', 'build'] },
      { emoji: '⚙️', name: 'Gear', keywords: ['gear', 'settings', 'cog'] },
      { emoji: '🧱', name: 'Brick', keywords: ['brick', 'wall', 'build'] },
      { emoji: '🔫', name: 'Pistol', keywords: ['gun', 'watergun', 'pistol', 'toy'] },
      { emoji: '💣', name: 'Bomb', keywords: ['bomb', 'explode', 'blast'] },
      { emoji: '🛡️', name: 'Shield', keywords: ['shield', 'defense', 'protect', 'secure'] },
      { emoji: '🔑', name: 'Key', keywords: ['key', 'lock', 'secure'] },
      { emoji: '🗝️', name: 'Old Key', keywords: ['key', 'old', 'secret', 'mystery'] },
      { emoji: '📦', name: 'Package', keywords: ['package', 'box', 'delivery', 'ship'] },
      { emoji: '✉️', name: 'Envelope', keywords: ['envelope', 'mail', 'letter'] },
      { emoji: '📝', name: 'Memo', keywords: ['memo', 'write', 'pencil', 'note'] },
      { emoji: '📚', name: 'Books', keywords: ['books', 'library', 'read', 'study'] },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols & Flags',
    icon: Heart,
    emojis: [
      { emoji: '💘', name: 'Heart with Arrow', keywords: ['heart', 'love', 'valentine'] },
      { emoji: '💖', name: 'Sparkling Heart', keywords: ['heart', 'love', 'sparkle', 'cute'] },
      { emoji: '💗', name: 'Growing Heart', keywords: ['heart', 'love', 'growing'] },
      { emoji: '💓', name: 'Beating Heart', keywords: ['heart', 'love', 'beating'] },
      { emoji: '💔', name: 'Broken Heart', keywords: ['heart', 'broken', 'sad', 'love'] },
      { emoji: '❤️', name: 'Red Heart', keywords: ['heart', 'love', 'like', 'passion'] },
      { emoji: '🧡', name: 'Orange Heart', keywords: ['heart', 'love', 'orange'] },
      { emoji: '💛', name: 'Yellow Heart', keywords: ['heart', 'love', 'yellow'] },
      { emoji: '💚', name: 'Green Heart', keywords: ['heart', 'love', 'green'] },
      { emoji: '💙', name: 'Blue Heart', keywords: ['heart', 'love', 'blue'] },
      { emoji: '💜', name: 'Purple Heart', keywords: ['heart', 'love', 'purple'] },
      { emoji: '🖤', name: 'Black Heart', keywords: ['heart', 'love', 'black'] },
      { emoji: '🤍', name: 'White Heart', keywords: ['heart', 'love', 'white'] },
      { emoji: '🤎', name: 'Brown Heart', keywords: ['heart', 'love', 'brown'] },
      { emoji: '🔥', name: 'Fire', keywords: ['fire', 'hot', 'lit', 'flame', 'trending'] },
      { emoji: '💥', name: 'Collision', keywords: ['boom', 'collision', 'blast', 'spark'] },
      { emoji: '🎉', name: 'Party Popper', keywords: ['party', 'celebrate', 'congrats', 'popper'] },
      { emoji: '✨', name: 'Sparkles', keywords: ['sparkles', 'magic', 'shiny', 'star'] },
      { emoji: '💯', name: 'Hundred Points', keywords: ['100', 'perfect', 'keepitreal', 'score'] },
      { emoji: '💡', name: 'Lightbulb Symbol', keywords: ['idea', 'light', 'mind'] },
      { emoji: '🏁', name: 'Chequered Flag', keywords: ['flag', 'race', 'finish'] },
      { emoji: '🚩', name: 'Triangular Flag', keywords: ['flag', 'warning', 'redflag'] },
      { emoji: '🇺🇸', name: 'United States', keywords: ['flag', 'usa', 'america'] },
      { emoji: '🇬🇧', name: 'United Kingdom', keywords: ['flag', 'uk', 'britain'] },
      { emoji: '🇨🇦', name: 'Canada', keywords: ['flag', 'canada'] },
      { emoji: '🇯🇵', name: 'Japan', keywords: ['flag', 'japan'] },
    ],
  },
];

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('smileys');

  // Filter or flatten matching emojis
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const matches: EmojiItem[] = [];
    EMOJI_CATALOG.forEach((cat) => {
      cat.emojis.forEach((item) => {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesKeywords = item.keywords.some((k) => k.toLowerCase().includes(q));
        if (matchesName || matchesKeywords) {
          matches.push(item);
        }
      });
    });
    return matches;
  }, [searchQuery]);

  const activeCategory = useMemo(() => {
    return EMOJI_CATALOG.find((cat) => cat.id === activeCategoryId) || EMOJI_CATALOG[0];
  }, [activeCategoryId]);

  return (
    <div
      id="emoji-picker-container"
      className="absolute bottom-14 left-0 w-80 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Search Input */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-950/80 flex items-center gap-2">
        <Search className="w-4 h-4 text-neutral-500 shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search emojis..."
          className="bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none w-full"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-[10px] font-bold text-neutral-500 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Category Icons Bar (Only shown if NOT searching) */}
      {!searchQuery && (
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-neutral-850 bg-neutral-900/50 shrink-0">
          {EMOJI_CATALOG.map((cat) => {
            const IconComp = cat.icon;
            const active = cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                title={cat.name}
                className={`p-1.5 rounded-lg transition ${
                  active ? 'bg-emerald-950/30 text-emerald-400' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      )}

      {/* Grid Content */}
      <div className="p-3 overflow-y-auto max-h-56 min-h-56 grid grid-cols-6 gap-2 bg-neutral-950/20">
        {searchResults !== null ? (
          searchResults.length > 0 ? (
            searchResults.map((item) => (
              <button
                key={item.emoji}
                type="button"
                onClick={() => onSelectEmoji(item.emoji)}
                title={item.name}
                className="text-2xl p-1.5 hover:scale-130 active:scale-95 transition-all text-center rounded-lg hover:bg-neutral-800/40"
              >
                {item.emoji}
              </button>
            ))
          ) : (
            <div className="col-span-6 py-8 text-center text-xs text-neutral-500 font-medium">
              No matching emojis found
            </div>
          )
        ) : (
          activeCategory.emojis.map((item) => (
            <button
              key={item.emoji}
              type="button"
              onClick={() => onSelectEmoji(item.emoji)}
              title={item.name}
              className="text-2xl p-1.5 hover:scale-130 active:scale-95 transition-all text-center rounded-lg hover:bg-neutral-800/40"
            >
              {item.emoji}
            </button>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3.5 py-2 border-t border-neutral-850 bg-neutral-950/80 flex items-center justify-between text-[10px] text-neutral-500 font-medium shrink-0">
        <span>Click emoji to insert</span>
        <button
          type="button"
          onClick={onClose}
          className="hover:text-white transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
