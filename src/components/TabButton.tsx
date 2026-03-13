import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function TabButton({ label, active, onPress }: Props) {
  return (
    <Pressable style={[styles.button, active && styles.active]} onPress={onPress}>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#16213a"
  },
  active: {
    backgroundColor: "#e6b800"
  },
  label: {
    color: "#c5cde0",
    fontWeight: "600"
  },
  activeLabel: {
    color: "#111111"
  }
});
