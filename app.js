import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, PermissionsAndroid, Platform, Alert } from 'react-native';
import { Audio } from 'expo-av';
import Geolocation from 'react-native-geolocation-service';
import axios from 'axios';
import MapView, { Marker } from 'react-native-maps';

const App = () => {
  const [role, setRole] = useState(null);
  const [position, setPosition] = useState(null);
  const [startPosition, setStartPosition] = useState(null);
  const [sound, setSound] = useState(null);
  const [storySegment, setStorySegment] = useState(0);
  const [message, setMessage] = useState('');
  const [region, setRegion] = useState(null);
  const [choices, setChoices] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState(null);

  // Haversine-formeln för avstånd och riktning
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Jordens radie i meter
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return { distance, direction: bearing };
  };

  // Berättelsedata (ersätt med S3-URL:er)
  const story = {
    investigator: [
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', trigger: { distance: 0, direction: null }, choices: null },
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', trigger: { distance: 100, direction: 'north' }, choices: [
        { id: 'search', text: 'Sök i gränden', nextSegment: 2 },
        { id: 'follow', text: 'Följ misstänkt', nextSegment: 3 }
      ]},
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', trigger: { distance: 0, direction: null, choice: 'search' }, choices: null },
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', trigger: { distance: 200, direction: 'north', choice: 'follow' }, choices: null }
    ],
    murderer: [
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', trigger: { distance: 0, direction: null }, choices: null },
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', trigger: { distance: 100, direction: 'south' }, choices: [
        { id: 'hide', text: 'Göm dig i lagret', nextSegment: 2 },
        { id: 'escape', text: 'Fly till hamnen', nextSegment: 3 }
      ]},
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', trigger: { distance: 0, direction: null, choice: 'hide' }, choices: null },
      { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', trigger: { distance: 200, direction: 'south', choice: 'escape' }, choices: null }
    ]
  };

  // Begär platsbehörighet
  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Platsbehörighet',
            message: 'Appen behöver åtkomst till din plats för att fungera.',
            buttonPositive: 'OK'
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  // Spara framsteg
  const saveProgress = async () => {
    try {
      await axios.post('http://localhost:3000/api/progress', {
        userId: 'test-user',
        role,
        storySegment,
        selectedChoice
      });
    } catch (err) {
      console.error('Kunde inte spara framsteg:', err);
    }
  };

  // Spela ljud
  const playSound = async (uri) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (err) {
      console.error('Fel vid ljuduppspelning:', err);
    }
  };

  // Hantera val
  const handleChoice = (choice) => {
    setSelectedChoice(choice.id);
    setStorySegment(choice.nextSegment);
    playSound(story[role][choice.nextSegment].audioUrl);
    setMessage(`Du valde: ${choice.text}`);
    saveProgress();
  };

  // GPS-spårning och kartuppdatering
  useEffect(() => {
    const setupLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        Alert.alert('Platsbehörighet nekad', 'Appen behöver platsåtkomst för att fungera.');
        return;
      }

      if (role) {
        playSound(story[role][storySegment].audioUrl);
        setChoices(story[role][storySegment].choices);
        const watchId = Geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setPosition({ latitude, longitude });
            setRegion({
              latitude,
              longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005
            });

            if (!startPosition) {
              setStartPosition({ latitude, longitude });
              return;
            }

            const { distance, direction } = haversineDistance(
              startPosition.latitude,
              startPosition.longitude,
              latitude,
              longitude
            );

            const currentTrigger = story[role][storySegment + 1]?.trigger;
            if (currentTrigger && distance >= currentTrigger.distance) {
              if (
                (currentTrigger.direction === 'north' && direction >= -45 && direction <= 45 && !currentTrigger.choice) ||
                (currentTrigger.direction === 'south' && (direction >= 135 || direction <= -135) && !currentTrigger.choice) ||
                (currentTrigger.choice && currentTrigger.choice === selectedChoice)
              ) {
                setStorySegment(storySegment + 1);
                playSound(story[role][storySegment + 1].audioUrl);
                setMessage(currentTrigger.direction
                  ? `Du nådde ${currentTrigger.distance}m ${currentTrigger.direction}!`
                  : `Du valde ${selectedChoice}!`);
                setChoices(story[role][storySegment + 1]?.choices);
                saveProgress();
              }
            }
          },
          (err) => {
            console.error(err);
            Alert.alert('GPS-fel', 'Kunde inte hämta platsdata.');
          },
          { enableHighAccuracy: true, distanceFilter: 5 }
        );
        return () => Geolocation.clearWatch(watchId);
      }
    };

    setupLocation();
    return () => sound && sound.unloadAsync();
  }, [role, startPosition, storySegment, selectedChoice]);

  return (
    <View style={styles.container}>
      {!role ? (
        <View style={styles.center}>
          <Text style={styles.title}>Röst i Mörkret</Text>
          <Text style={styles.subtitle}>Välj din roll:</Text>
          <Button title="Utredare" onPress={() => setRole('investigator')} />
          <Button title="Mördare" onPress={() => setRole('murderer')} />
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.title}>Spelar som: {role === 'investigator' ? 'Utredare' : 'Mördare'}</Text>
          <Text>Position: {position ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : 'Hämtar...'}</Text>
          <Text>{message}</Text>
          {region && (
            <MapView
              style={styles.map}
              region={region}
              showsUserLocation={true}
              followsUserLocation={true}
            >
              {startPosition && (
                <Marker
                  coordinate={{ latitude: startPosition.latitude, longitude: startPosition.longitude }}
                  title="Startpunkt"
                  description="Här började ditt äventyr"
                  pinColor="blue"
                />
              )}
              {story[role][storySegment + 1]?.trigger.distance && !story[role][storySegment + 1]?.trigger.choice && (
                <Marker
                  coordinate={{
                    latitude: startPosition.latitude + (story[role][storySegment + 1].trigger.direction === 'north' ? 0.001 : -0.001),
                    longitude: startPosition.longitude
                  }}
                  title="Nästa ledtråd"
                  description={`Gå ${story[role][storySegment + 1].trigger.distance}m ${story[role][storySegment + 1].trigger.direction}`}
                  pinColor="red"
                />
              )}
            </MapView>
          )}
          {choices && (
            <View style={styles.choices}>
              {choices.map((choice) => (
                <Button
                  key={choice.id}
                  title={choice.text}
                  onPress={() => handleChoice(choice)}
                />
              ))}
            </View>
          )}
          <Button
            title="Byt roll"
            onPress={() => {
              setRole(null);
              setStorySegment(0);
              setStartPosition(null);
              setMessage('');
              setRegion(null);
              setChoices(null);
              setSelectedChoice(null);
            }}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1F2937', justifyContent: 'center' },
  center: { alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 10 },
  subtitle: { fontSize: 18, color: 'white', marginBottom: 20 },
  map: { width: '100%', height: 300, marginVertical: 20 },
  choices: { marginVertical: 10, width: '80%' }
});

export default App;
