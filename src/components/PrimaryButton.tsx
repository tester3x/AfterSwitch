import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

type Props = {
  label: string;
  onPress: () => void;
};

export function PrimaryButton({ label, onPress }: Props) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#e6b800",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12
  },
  label: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center"
  }
});
