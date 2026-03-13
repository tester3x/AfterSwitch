import React, { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function SectionCard({ title, subtitle, children }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141b2d",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#25304c"
  },
  title: {
    color: "white",
    fontSize: 18,
    fontWeight: "700"
  },
  subtitle: {
    color: "#b7c1d6",
    fontSize: 13,
    marginTop: 4
  },
  body: {
    marginTop: 12,
    gap: 8
  }
});
