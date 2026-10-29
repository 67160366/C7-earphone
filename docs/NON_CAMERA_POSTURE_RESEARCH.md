# Non-camera posture sensing: research notes

Persistent user requirement: no cameras for measurement, calibration, demo or proposed project solutions. Recorded in AGENTS.md, README.md and HANDOFF.md. Reference equipment used in published experiments is described only to assess evidence.

## Interpretation

Orientation, relative segment orientation, posture classification, inferred CVA and measured anatomical position are different outputs. A classification accuracy is not an angular or centimetre error. Published use of the term CVA does not by itself establish direct geometric measurement. None of the sources below validates this repository's current constants or placement of two ear BNO085 modules plus MPU6050.

## 1. MPU6050 directly relevant to this hardware (2024)

Park and Jung, *Real-Time Forward Head Posture Detection and Correction System Utilizing an Inertial Measurement Unit Sensor*, Applied Sciences 14, 9075. [Full paper](https://mdpi-res.com/d_attachment/applsci/applsci-14-09075/article_deploy/applsci-14-09075.pdf), DOI 10.3390/app14199075.

Methods: single MPU6050; compare forehead, chest, back-of-neck and cervical-spine attachment. Select cervical-spine position. Tilt from gravity components, not displacement integration; empirical CVA = tilt + 89 degrees. Initial good-posture average about10s; threshold5degrees below baseline, persisted10s. Ten male participants. Position selection compared against side-photo CVA (reference equipment in that study only).

Assessment: useful evidence for mounting-location-dependent FHP estimation. The offset and association are experimental, not a universal geometric identity; sensor tilt accuracy does not establish CVA accuracy for arbitrary translation. Do not copy +89 or the threshold into our firmware without validation.

## 2. Ear accelerometer plus neck flex sensor (2014)

Yeom et al., *A new posture-correcting system using a vector angle model for preventing forward head posture*, Biotechnology & Biotechnological Equipment 28(sup1), S6–S13. [Primary article in PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4433962/), DOI 10.1080/13102818.2014.949040.

Methods: three-axis accelerometer at right ear and resistive flex sensor behind neck. Combine head and neck signals in a vector model; propose double integration for displacement. Authors explicitly identify insufficiency of ear accelerometry alone and need for more vector/calibration research.

Assessment: directly relevant design precedent, not proof that double integration solves long-term centimetre tracking. Adding neck deformation supplies different physical information; flex readings still need mounting/geometry calibration and validation.

Access: indexed primary full-text excerpts available; direct PMC request returned a browser check in this session. Do not claim independently reproduced results or a clinical accuracy figure.

## 3. Skin-integrated neck inclination and haptic feedback (2023)

Luo et al., *A skin-integrated device for neck posture monitoring and correction*, Microsystems & Nanoengineering 9,150. [Full paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10682425/), DOI 10.1038/s41378-023-00613-0.

Methods: neck-mounted accelerometer and four localized vibration actuators; derive flexion/lateral-bending angles from gravity. Attachment stability is part of the design. Reported pitch/roll RMSE about1.37/1.14degrees against a digital level before day-long attachment testing.

Assessment: validates local inclination sensing and feedback, not C7-to-ear distance or CVA. Authors note whole-body posture can influence the readings. Useful precedent for secure mounting and truthful angle-based alerts.

## 4. Hearable IMU plus acoustic ranging (2024 preprint)

Chhaglani and Seefeldt, *NeckCare: Preventing Tech Neck using Hearable-based Multimodal Sensing*. [Full preprint](https://arxiv.org/html/2412.13579v1), arXiv:2412.13579v1. This is the preprint version inspected; journal acceptance not established here.

Methods: headset IMU pitch/displacement at50Hz, two microphones and laptop-side speaker chirps; synchronized acoustic time-of-flight. Random Forest classifies five instructed postures in15participants (10training, remainder testing). Authors report96% IMU-only and99% combined classification. Double-integrated displacement is explicitly unreliable and reset to zero.

Assessment: acoustic range is headset-to-screen, not C7-to-ear. Reported static millimetre performance becomes centimetre jumps with small movements. Useful non-camera precedent for adding independent sensing, not transferable CVA accuracy or an off-the-shelf ESP32 implementation.

## 5. Accelerometers, magnetometers and miniature magnets (2020)

Jang, Han and Yoon, *Comprehensive Monitoring of Bad Head and Shoulder Postures by Wearable Magnetic Sensors and Deep Learning*, IEEE Sensors Journal20(22),13768–13775. [Author-institution record/abstract](https://hanyang.scholarworks.kr/item/ac47f7e1-9442-4494-b4d0-a95702f42ab4), DOI10.1109/JSEN.2020.3004562.

Methods available from abstract: accelerometers plus magnetometers paired with miniature magnets; selected locations, neck/shoulder angle features, DNN/CNN posture classification. Reported classification accuracy88.1/88.7%.

Assessment: promising independent magnetic signal for relative motion. Full methods were not obtained, so sensor layout, calibration, participant count, split and anatomical-angle error remain unverified. Not equivalent to adding another ordinary orientation-only IMU. A deliberate magnet near a BNO requires separate raw-field sensing/fusion design; do not assume normal heading outputs remain usable.

## Proposed project directions (engineering inference, not reproduced results)

1. Existing hardware: study mounting-sensitive neck inclination and head-versus-torso orientation with neutral calibration. Include deliberate chin-forward/head-level and whole-torso-lean trials; log misses. Label output posture features or estimated posture rather than directly measured CVA.
2. For the head-level translation gap: prototype one independent observable, such as neck flex/strain or a designed magnet–magnetometer pair. Test sensitivity to translation versus rotation, mounting slip, clothing and repeated attachment before selecting it. These measure deformation/field, not automatically anatomical CVA.
3. If centimetres/CVA are required, establish a non-camera reference protocol: manual anatomical alignment instrument/digital inclinometer for the C7–tragus line, and controlled translation jig/ruler for bench displacement. Instrument tilt alone is not a CVA reference. Assess bias, absolute error and repeatability across users/remounts; classification needs participant-separated evaluation and confusion matrices.
4. Acoustic screen ranging is an optional desk-use direction; it requires external synchronized audio hardware and can be confounded by torso movement. It is not presently chosen for this project.

No firmware, physical wiring, calibration, data collection or new hardware purchase was performed as part of this literature review. No evidence found in this selected review that merely averaging two ear BNO orientations determines anatomical C7–ear geometry. This is a scoped review, not an exhaustive systematic review.
