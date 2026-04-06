import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Modal,
    Share,
    TextInput,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BASE_URL from "../config/api";
import * as WebBrowser from 'expo-web-browser';
import { Audio, ResizeMode, Video } from 'expo-av';

export default function CloudStorage() {
    const [recordings, setRecordings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'video' | 'audio'>('video');
    const [playingUrl, setPlayingUrl] = useState<string | null>(null);
    const [selectedRecording, setSelectedRecording] = useState<any | null>(null);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioLoading, setAudioLoading] = useState(false);
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [renameTarget, setRenameTarget] = useState<any | null>(null);
    const [renameText, setRenameText] = useState("");
    const videoRef = useRef<any>(null);
    const audioSoundRef = useRef<Audio.Sound | null>(null);
    const router = useRouter();

    const stopAudioPlayback = async () => {
        if (!audioSoundRef.current) {
            setIsAudioPlaying(false);
            return;
        }

        try {
            await audioSoundRef.current.stopAsync();
            await audioSoundRef.current.unloadAsync();
        } catch (error) {
            console.log("Audio stop error:", error);
        } finally {
            audioSoundRef.current = null;
            setIsAudioPlaying(false);
            setAudioLoading(false);
        }
    };

    const closePlayer = async () => {
        await stopAudioPlayback();
        setPlayingUrl(null);
        setSelectedRecording(null);
    };

    const toggleAudioPlayback = async () => {
        if (!playingUrl || selectedRecording?.type?.includes('video')) return;

        if (audioSoundRef.current && isAudioPlaying) {
            await audioSoundRef.current.pauseAsync();
            setIsAudioPlaying(false);
            return;
        }

        if (audioSoundRef.current) {
            await audioSoundRef.current.playAsync();
            setIsAudioPlaying(true);
            return;
        }

        try {
            setAudioLoading(true);
            const { sound } = await Audio.Sound.createAsync(
                { uri: playingUrl },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsAudioPlaying(false);
                    }
                }
            );
            audioSoundRef.current = sound;
            setIsAudioPlaying(true);
        } catch (error) {
            console.error('Audio playback error:', error);
            Alert.alert('Error', 'Unable to play this audio. It may be corrupted or in an unsupported format.');
        } finally {
            setAudioLoading(false);
        }
    };

    useEffect(() => {
        return () => {
            audioSoundRef.current?.unloadAsync().catch(() => {});
        };
    }, []);

    const fetchRecordings = async () => {
        try {
            const userId = await AsyncStorage.getItem("userId");
            const email = await AsyncStorage.getItem("userEmail");
            if (!userId && !email) return;

            let res = userId
                ? await fetch(`${BASE_URL}/recordings/user/${userId}`)
                : null;

            if ((!res || !res.ok) && email) {
                res = await fetch(`${BASE_URL}/recordings/${email}`);
            }

            if (!res) return;
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setRecordings(data);
            }
        } catch (err) {
            console.error("Fetch recordings error:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchRecordings();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchRecordings();
    };

    const handleDelete = async (id: number) => {
        Alert.alert(
            "Delete Recording",
            "Are you sure you want to delete this evidence permanently?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            // Find the recording to get its Cloudinary public_id
                            const recording = null as any;
                            
                            // First delete from database
                            const res = await fetch(`${BASE_URL}/delete-recording/${id}`, {
                                method: 'DELETE'
                            });
                            
                            if (!res.ok) {
                                const data = await res.json().catch(() => null);
                                throw new Error(data?.message || 'Failed to delete recording');
                            }
                            
                            // If recording has a Cloudinary URL, also delete from Cloudinary
                            if (recording && recording.url && recording.url.includes('cloudinary')) {
                                console.log('🗑️ Also deleting from Cloudinary...');
                                
                                try {
                                    // Extract public_id from Cloudinary URL
                                    const urlParts = recording.url.split('/');
                                    const fileNameWithExt = urlParts[urlParts.length - 1];
                                    const publicId = fileNameWithExt.split('.')[0]; // Remove file extension
                                    
                                    console.log(`🗑️ Deleting Cloudinary file with public_id: ${publicId}`);
                                    
                                    // Call backend to delete from Cloudinary
                                    const cloudinaryRes = await fetch(`${BASE_URL}/delete-cloudinary/${publicId}`, {
                                        method: 'DELETE'
                                    });
                                    
                                    if (cloudinaryRes.ok) {
                                        console.log('✅ Successfully deleted from Cloudinary');
                                    } else {
                                        console.warn('⚠️ Failed to delete from Cloudinary, but database record was removed');
                                    }
                                } catch (cloudinaryErr) {
                                    console.warn('⚠️ Cloudinary deletion error:', cloudinaryErr);
                                    // Don't fail the whole operation if Cloudinary deletion fails
                                }
                            }
                            
                            // Remove from local state
                            setRecordings(prev => prev.filter(r => r.id !== id));
                            
                            Alert.alert(
                                "Success",
                                "Recording deleted successfully",
                                [{ text: "OK" }]
                            );
                            
                        } catch (err) {
                            console.error("Delete error:", err);
                            Alert.alert(
                                "Error",
                                "Failed to delete recording. Please try again.",
                                [{ text: "OK" }]
                            );
                        }
                    }
                }
            ]
        );
    };

    const openRenameModal = (recording: any) => {
        setRenameTarget(recording);
        setRenameText(recording.filename || (recording.type?.includes('video') ? "Video Evidence" : "Audio Evidence"));
        setRenameModalVisible(true);
    };

    const closeRenameModal = () => {
        setRenameModalVisible(false);
        setRenameTarget(null);
        setRenameText("");
    };

    const handleRename = async () => {
        if (!renameTarget) return;

        const cleanedName = renameText.trim();
        if (!cleanedName) {
            Alert.alert("Required", "Please enter a recording name.");
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/rename-recording/${renameTarget.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: cleanedName }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(data?.message || "Failed to rename recording");
            }

            setRecordings((prev) =>
                prev.map((recording) =>
                    recording.id === renameTarget.id
                        ? { ...recording, filename: cleanedName }
                        : recording
                )
            );
            closeRenameModal();
        } catch (error) {
            console.error("Rename error:", error);
            Alert.alert("Error", "Failed to rename recording. Please try again.");
        }
    };

    const handleShare = async (recording: any) => {
        if (!recording?.url) {
            Alert.alert("Unavailable", "No Cloudinary link is available for this recording.");
            return;
        }

        try {
            const recordingType = recording.type?.includes('video') ? "video" : "audio";
            await Share.share({
                title: `SHEILD ${recordingType} evidence`,
                message: `SHEILD ${recordingType} evidence: ${recording.url}`,
                url: recording.url,
            });
        } catch (error) {
            console.error("Share error:", error);
            Alert.alert("Error", "Unable to share this recording link.");
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const filteredRecordings = recordings.filter(r =>
        filter === 'video' ? r.type === 'video' || r.type === 'video_clip' : r.type === 'audio' || r.type === 'audio_call'
    );

    return (
        <View style={styles.container}>

            {/* HEADER */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back-ios" size={26} color="#ec1313" />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Cloud Storage</Text>
                        <Text style={styles.headerSub}>Emergency recordings saved securely</Text>
                    </View>
                </View>
                <MaterialIcons name="more-vert" size={24} color="#aaa" />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                {/* STORAGE STATUS */}
                <View style={styles.statusCard}>
                    <View style={styles.statusIcon}>
                        <MaterialIcons name="cloud-done" size={24} color="#ec1313" />
                    </View>
                    <View>
                        <Text style={styles.statusTitle}>Secure Cloud Backup Active</Text>
                        <Text style={styles.statusSub}>Audio and video evidence stored safely</Text>
                    </View>
                </View>

                {/* FILTER BUTTONS */}
                <View style={styles.filterRow}>
                    <TouchableOpacity
                        style={filter === 'audio' ? styles.activeFilter : styles.filter}
                        onPress={() => setFilter('audio')}
                    >
                        <Text style={filter === 'audio' ? styles.activeFilterText : styles.filterText}>Audio</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={filter === 'video' ? styles.activeFilter : styles.filter}
                        onPress={() => setFilter('video')}
                    >
                        <Text style={filter === 'video' ? styles.activeFilterText : styles.filterText}>Video</Text>
                    </TouchableOpacity>
                </View>

                {/* RECORDINGS */}
                {loading ? (
                    <ActivityIndicator size="large" color="#ec1313" style={{ marginTop: 50 }} />
                ) : filteredRecordings.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <MaterialIcons name="folder-open" size={64} color="#333" />
                        <Text style={styles.emptyText}>No recordings found</Text>
                    </View>
                ) : (
                    filteredRecordings.map((rec) => (
                        <RecordingCard
                            key={rec.id}
                            icon={rec.type.includes('video') ? "videocam" : "mic"}
                            title={rec.filename || (rec.type.includes('video') ? "Video Evidence" : "Audio Evidence")}
                            date={formatDate(rec.recorded_at)}
                            keyword={rec.keyword}
                            location={rec.location}
                            onDelete={() => handleDelete(rec.id)}
                            onRename={() => openRenameModal(rec)}
                            onShare={() => handleShare(rec)}
                            onPlay={() => {
                                setSelectedRecording(rec);
                                setPlayingUrl(rec.url);
                            }}
                        />
                    ))
                )}
            </ScrollView>

            {/* VIDEO/AUDIO PLAYER MODAL */}
            <Modal
                visible={!!playingUrl}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    closePlayer().catch((error) => console.log("Close player error:", error));
                }}
            >
                <View style={styles.playerWrapper}>
                    <View style={styles.playerContainer}>
                        <View style={styles.playerHeader}>
                            <Text style={styles.playerTitle}>
                                {selectedRecording?.type?.includes('video') ? 'Video Evidence' : 'Audio Evidence'}
                            </Text>
                            <TouchableOpacity
                                onPress={() => {
                                    closePlayer().catch((error) => console.log("Close player error:", error));
                                }}
                            >
                                <MaterialIcons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {playingUrl && (
                            <View style={styles.mediaContainer}>
                                {selectedRecording?.type?.includes('video') ? (
                                    <Video
                                        ref={videoRef}
                                        source={{ uri: playingUrl }}
                                        rate={1.0}
                                        volume={1.0}
                                        isMuted={false}
                                        resizeMode={ResizeMode.CONTAIN}
                                        shouldPlay
                                        useNativeControls
                                        style={styles.videoPlayer}
                                        onError={(error) => {
                                            console.error('Video playback error:', error);
                                            Alert.alert('Error', 'Unable to play this video. It may be corrupted or in an unsupported format.');
                                        }}
                                        onLoad={() => {
                                            console.log('Video loaded successfully');
                                        }}
                                        onPlaybackStatusUpdate={(status) => {
                                            if (status.isLoaded) {
                                                console.log('Video playback status:', status);
                                            }
                                        }}
                                    />
                                ) : (
                                    <View style={styles.audioPlayerContainer}>
                                        <MaterialIcons name="audiotrack" size={64} color="#ec1313" style={styles.audioIcon} />
                                        <Text style={styles.audioText}>Audio Evidence</Text>
                                        <Text style={styles.audioSubText}>
                                            {isAudioPlaying ? 'Playing in app' : 'Ready to play in app'}
                                        </Text>
                                        <TouchableOpacity 
                                            style={styles.openInBrowserBtn}
                                            onPress={() => toggleAudioPlayback().catch((error) => console.log("Audio playback error:", error))}
                                            disabled={audioLoading}
                                        >
                                            <Text style={styles.openInBrowserBtnText}>
                                                {audioLoading ? 'Loading...' : isAudioPlaying ? 'Pause Audio' : 'Play Audio'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}

                        <TouchableOpacity style={styles.browserBtn} onPress={() => {
                            if (playingUrl) WebBrowser.openBrowserAsync(playingUrl);
                        }}>
                            <MaterialIcons name="open-in-browser" size={16} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.browserBtnText}>Open in Browser</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={closeRenameModal}>
                <View style={styles.renameWrapper}>
                    <View style={styles.renameContainer}>
                        <Text style={styles.renameTitle}>Rename Recording</Text>
                        <TextInput
                            style={styles.renameInput}
                            value={renameText}
                            onChangeText={setRenameText}
                            placeholder="Recording name"
                            placeholderTextColor="#777"
                        />
                        <View style={styles.renameActions}>
                            <TouchableOpacity style={styles.renameCancelBtn} onPress={closeRenameModal}>
                                <Text style={styles.renameCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.renameSaveBtn} onPress={handleRename}>
                                <Text style={styles.renameSaveText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* BOTTOM NAVBAR */}
            <View style={styles.navBar}>
                <NavItem icon="home" label="Home" onPress={() => router.replace("/dashboard")} />
                <NavItem icon="group" label="Contacts" onPress={() => router.push("/contacts")} />
                <NavItem icon="cloud" label="Storage" active />
                <NavItem icon="phone-in-talk" label="Fake Call" onPress={() => router.push("/fake-call")} />
                <NavItem icon="settings" label="Settings" onPress={() => router.push("/settings")} />
            </View>
        </View>
    );
}

/* RECORDING CARD */
interface RecordingCardProps {
    icon: React.ComponentProps<typeof MaterialIcons>["name"];
    title: string;
    date: string;
    onDelete: () => void;
    onRename: () => void;
    onShare: () => void;
    onPlay: () => void;
    keyword?: string;
    location?: string;
}

function RecordingCard({ icon, title, date, onDelete, onRename, onShare, onPlay, keyword, location }: RecordingCardProps) {
    return (
        <View style={styles.recordingCard}>
            <View style={styles.recordingLeft}>
                <View style={styles.recordIcon}>
                    <MaterialIcons name={icon} size={22} color="#ec1313" />
                </View>
                <View style={styles.textContainer}>
                    <Text style={styles.recordTitle}>{title}</Text>
                    <Text style={styles.recordMeta}>{date}</Text>
                    {keyword ? <Text style={styles.kwText}>Trigger: {keyword}</Text> : null}
                    {location ? (
                        <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(location)}>
                            <Text style={styles.locText} numberOfLines={1}>📍 Location Link</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={onPlay}>
                    <MaterialIcons name="play-arrow" size={20} color="#ccc" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={onRename}>
                    <MaterialIcons name="edit" size={20} color="#ccc" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={onShare}>
                    <MaterialIcons name="share" size={20} color="#ccc" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={onDelete}>
                    <MaterialIcons name="delete" size={20} color="#ec1313" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

/* NAV ITEM */
interface NavItemProps {
    icon: React.ComponentProps<typeof MaterialIcons>["name"];
    label: string;
    active?: boolean;
    onPress?: () => void;
}

function NavItem({ icon, label, active, onPress }: NavItemProps) {
    return (
        <TouchableOpacity style={styles.navItem} onPress={onPress}>
            <MaterialIcons name={icon} size={24} color={active ? "#ec1313" : "#777"} />
            <Text style={[styles.navLabel, { color: active ? "#ec1313" : "#777" }]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
        paddingTop: 40,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    headerIcon: {
        backgroundColor: "rgba(236,19,19,0.1)",
        padding: 10,
        borderRadius: 15,
        marginRight: 12,
    },
    headerTitle: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
    },
    headerSub: {
        color: "#aaa",
        fontSize: 12,
    },
    statusCard: {
        backgroundColor: "#2a1b1b",
        marginHorizontal: 20,
        marginBottom: 20,
        padding: 15,
        borderRadius: 20,
        flexDirection: "row",
        alignItems: "center",
    },
    statusIcon: {
        backgroundColor: "rgba(236,19,19,0.2)",
        padding: 8,
        borderRadius: 10,
        marginRight: 10,
    },
    statusTitle: {
        color: "#fff",
        fontWeight: "bold",
    },
    statusSub: {
        color: "#aaa",
        fontSize: 12,
    },
    filterRow: {
        flexDirection: "row",
        paddingHorizontal: 20,
        marginBottom: 15,
    },
    activeFilter: {
        flex: 1,
        backgroundColor: "#ec1313",
        padding: 12,
        borderRadius: 15,
        alignItems: "center",
        marginRight: 10,
    },
    filter: {
        flex: 1,
        backgroundColor: "#2a1b1b",
        padding: 12,
        borderRadius: 15,
        alignItems: "center",
    },
    activeFilterText: {
        color: "#fff",
        fontWeight: "bold",
    },
    filterText: {
        color: "#aaa",
        fontWeight: "bold",
    },
    recordingCard: {
        backgroundColor: "#2a1b1b",
        marginHorizontal: 20,
        marginBottom: 10,
        padding: 15,
        borderRadius: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    recordingLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    recordIcon: {
        backgroundColor: "#1f1f1f",
        padding: 8,
        borderRadius: 10,
        marginRight: 10,
    },
    textContainer: {
        flex: 1,
    },
    recordTitle: {
        color: "#fff",
        fontWeight: "bold",
    },
    recordMeta: {
        color: "#888",
        fontSize: 11,
    },
    kwText: {
        color: "#f59e0b",
        fontSize: 11,
        marginTop: 2,
    },
    locText: {
        color: "#3498db",
        fontSize: 10,
        marginTop: 2,
        textDecorationLine: 'underline',
    },
    actionRow: {
        flexDirection: "row",
    },
    actionBtn: {
        backgroundColor: "#1f1f1f",
        padding: 8,
        borderRadius: 20,
        marginLeft: 6,
    },
    navBar: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        height: 80,
        backgroundColor: "#181111",
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
    },
    navItem: {
        alignItems: "center",
    },
    navLabel: {
        fontSize: 10,
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 100,
    },
    emptyText: {
        color: "#555",
        marginTop: 10,
        fontSize: 16,
    },
    playerWrapper: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playerContainer: {
        width: '95%',
        aspectRatio: 16 / 9,
        backgroundColor: '#000',
        borderRadius: 20,
        overflow: 'hidden',
    },
    playerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 15,
        backgroundColor: '#1a0f0f',
    },
    playerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    videoPlayer: {
        flex: 1,
        width: '100%',
    },
    browserBtn: {
        backgroundColor: '#ec1313',
        padding: 15,
        alignItems: 'center',
    },
    browserBtnText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    mediaContainer: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    audioPlayerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    audioIcon: {
        marginBottom: 20,
    },
    audioText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    audioSubText: {
        color: '#aaa',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 30,
    },
    openInBrowserBtn: {
        backgroundColor: '#ec1313',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
    },
    openInBrowserBtnText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    renameWrapper: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    renameContainer: {
        width: '100%',
        backgroundColor: '#2a1b1b',
        borderRadius: 20,
        padding: 20,
    },
    renameTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 14,
    },
    renameInput: {
        backgroundColor: '#1f1f1f',
        borderRadius: 14,
        color: '#fff',
        padding: 14,
        marginBottom: 18,
    },
    renameActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    renameCancelBtn: {
        paddingHorizontal: 18,
        paddingVertical: 12,
        marginRight: 10,
    },
    renameCancelText: {
        color: '#aaa',
        fontWeight: 'bold',
    },
    renameSaveBtn: {
        backgroundColor: '#ec1313',
        borderRadius: 12,
        paddingHorizontal: 22,
        paddingVertical: 12,
    },
    renameSaveText: {
        color: '#fff',
        fontWeight: 'bold',
    },
});
