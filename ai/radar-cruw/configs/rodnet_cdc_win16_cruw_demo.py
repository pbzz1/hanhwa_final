# RODNet prepare_data / test 용: 공식 config_rodnet_cdc_win16.py 의 demo 에 `seqs: []` 가 있으면
# prepare_data 가 디렉터리를 나열하지 않고 빈 목록으로 처리되어 .pkl 이 생성되지 않습니다.
# demo 에서는 `seqs` 키를 두지 않아 `sequences/demo/<시퀀스>` 를 자동 스캔합니다.

dataset_cfg = dict(
    dataset_name='ROD2021',
    base_root="/mnt/disk1/CRUW/ROD2021",
    data_root="/mnt/disk1/CRUW/ROD2021/sequences",
    anno_root="/mnt/disk1/CRUW/ROD2021/annotations",
    anno_ext='.txt',
    train=dict(
        subdir='train',
    ),
    valid=dict(
        subdir='valid',
        seqs=[],
    ),
    test=dict(
        subdir='test',
    ),
    demo=dict(
        subdir='demo',
    ),
)

model_cfg = dict(
    type='CDC',
    name='rodnet-cdc-win16',
    max_dets=20,
    peak_thres=0.3,
    ols_thres=0.3,
)

confmap_cfg = dict(
    confmap_sigmas={
        'pedestrian': 15,
        'cyclist': 20,
        'car': 30,
    },
    confmap_sigmas_interval={
        'pedestrian': [5, 15],
        'cyclist': [8, 20],
        'car': [10, 30],
    },
    confmap_length={
        'pedestrian': 1,
        'cyclist': 2,
        'car': 3,
    }
)

train_cfg = dict(
    n_epoch=100,
    batch_size=4,
    lr=0.00001,
    lr_step=5,
    win_size=16,
    train_step=1,
    train_stride=4,
    log_step=100,
    save_step=10000,
)
test_cfg = dict(
    test_step=1,
    test_stride=8,
    rr_min=1.0,
    rr_max=20.0,
    ra_min=-60.0,
    ra_max=60.0,
)
