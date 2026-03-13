import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { signInWithGoogle } from '../services/firebase';

type Props = {
  onSignedIn: () => void;
};

export function SignInScreen({ onSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      onSignedIn();
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('cancelled') || msg.includes('CANCELED')) {
        // User cancelled — don't show error
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>After<Text style={styles.titleAccent}>Switch</Text></Text>
        <Text style={styles.subtitle}>
          Your phone settings, backed up and restorable.
        </Text>
        <Text style={styles.description}>
          Sign in with Google to save your settings to the cloud.
          Access them from any device, anytime.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.signInButton}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#0b1020" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.signInText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 16,
  },
  title: {
    color: 'white',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 6,
  },
  titleAccent: {
    color: '#e6b800',
  },
  subtitle: {
    color: '#b7c1d6',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    color: '#6b7fa0',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 32,
  },
  errorBox: {
    backgroundColor: '#2a1010',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#f87171',
    width: '100%',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6b800',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    gap: 10,
  },
  googleIcon: {
    color: '#0b1020',
    fontSize: 20,
    fontWeight: '700',
  },
  signInText: {
    color: '#0b1020',
    fontSize: 16,
    fontWeight: '700',
  },
});
