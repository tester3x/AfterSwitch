import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
};

export function InfoRow({ label, value }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4
  },
  label: {
    color: "#90a0bf",
    fontSize: 12
  },
  value: {
    color: "white",
    fontSize: 15
  }
});
