import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Reports</Text>
      <View style={styles.body}>
        <Text style={styles.text}>Med-Tracker mobile Reports screen.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fafafa' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  body: { flex: 1 },
  text: { fontSize: 14, color: '#555' },
});
