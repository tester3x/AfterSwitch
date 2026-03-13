import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCodeScanned: (code: string) => void;
};

export function QRScannerModal({ visible, onClose, onCodeScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Reset scanned state when modal opens
  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);

      // Parse afterswitch://profile/{code} or just a raw code
      let code = data;
      const match = data.match(/afterswitch:\/\/profile\/([A-Za-z0-9]+)/);
      if (match) {
        code = match[1];
      }

      onCodeScanned(code.toUpperCase());
    },
    [scanned, onCodeScanned],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan QR Code</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeBtn}>Cancel</Text>
          </Pressable>
        </View>

        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              AfterSwitch needs camera access to scan QR codes.
            </Text>
            <Pressable style={styles.grantBtn} onPress={requestPermission}>
              <Text style={styles.grantBtnText}>Grant Camera Access</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
            {/* Viewfinder overlay */}
            <View style={styles.overlay}>
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.viewfinder}>
                  {/* Corner markers */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom}>
                <Text style={styles.hint}>
                  Point at an AfterSwitch QR code
                </Text>
                {scanned && (
                  <Pressable
                    style={styles.rescanBtn}
                    onPress={() => setScanned(false)}
                  >
                    <Text style={styles.rescanText}>Scan Again</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const VIEWFINDER_SIZE = 250;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
  },
  // Permission
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 20,
  },
  permissionText: {
    color: '#b7c1d6',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  grantBtn: {
    backgroundColor: '#e6b800',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  grantBtnText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
  },
  // Camera
  cameraWrapper: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  // Viewfinder overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(11,16,32,0.75)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: VIEWFINDER_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(11,16,32,0.75)',
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(11,16,32,0.75)',
    alignItems: 'center',
    paddingTop: 24,
    gap: 16,
  },
  // Corner markers
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#e6b800',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  hint: {
    color: '#b7c1d6',
    fontSize: 14,
  },
  rescanBtn: {
    backgroundColor: '#e6b800',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  rescanText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
});
