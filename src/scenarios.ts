import { Scenario } from './types';

export const SCENARIOS: Scenario[] = [
  {
    id: 'cyberpunk-detective',
    title: 'Neo-Neon Detective',
    genre: 'Noir Cyberpunk',
    description: 'Investigate the murder of a high-ranking megacorp executive in the rain-slicked neon alleys of Sector 7.',
    coverImagePrompt: 'Cyberpunk detective standing in a rain-slicked dark alley with brilliant pink and cyan neon signs, digital art style, high contrast',
    initialState: {
      world: {
        currentDay: 1,
        weather: 'Acid Rain',
        time: 'Late Night',
        location: 'Sector 7: Noodle Bar Alley',
        details: {
          atmosphere: 'Heavy hum of sub-bass advertisements, flickering holographic banners, and the smell of ozone.',
          districtControl: 'Saito Heavy Industries security drones patrol the skies.'
        }
      },
      player: {
        name: 'Detective Kaelen',
        hp: 80,
        maxHp: 100,
        inventory: ['Encrypted Datacore', 'Standard Blaster', 'Neural-Dampener Injector'],
        statusEffects: ['Neural Glitch (Mild)'],
        attributes: {
          hacking: 7,
          perception: 8,
          combat: 5,
          charisma: 4
        }
      },
      characters: {
        'aria': {
          name: 'A.R.I.A.',
          relationship: 60,
          goals: 'Protect Kaelen\'s neural integrity and decrypt Saito corporate records.',
          status: 'Active',
          currentActivity: 'Scanning ambient networks for Saito drone signatures.'
        },
        'vex': {
          name: 'Vex',
          relationship: 10,
          goals: 'Acquire high-value data to sell to the highest bidder in the Black Market.',
          status: 'Suspicious',
          currentActivity: 'Waiting for Kaelen inside the "Red Line" cyber-lounge.'
        }
      },
      story: {
        activeQuests: [
          {
            id: 'decrypt-core',
            title: 'The Corpse\'s Gift',
            description: 'Find a way to decrypt the Saito Datacore before Saito Industries trace its unique signal to your location.',
            status: 'active'
          }
        ],
        completedEvents: [],
        flags: {
          'has_saito_datacore': true,
          'saito_drones_aware': false,
          'met_vex': false
        }
      }
    },
    initialMemory: {
      working: ['The Saito corporate datacore is hot in Kaelen\'s trenchcoat pocket.', 'Saito Tactical squads are sweeping the lower levels.'],
      episode: ['Found Saito executive Kenji Saito dead in a drainage canal 30 minutes ago.', 'Extracted Saito datacore from Kenji\'s cybernetic neck port.'],
      semantic: ['Saito Heavy Industries owns 85% of Sector 7.', 'A Saito corporate datacore will trigger a neuro-lethal self-destruct if decrypted incorrectly.'],
      archive: ['Kaelen used to work as a Saito Corporate Security Agent 3 years ago before being dishonorably discharged.']
    }
  },
  {
    id: 'steampunk-airship',
    title: 'The Clockwork Citadel',
    genre: 'Steampunk Fantasy',
    description: 'Save the floating airship flagship Zephyr from sabotaged engines and plummeting altitude among tempestuous storm clouds.',
    coverImagePrompt: 'Beautiful retro-futuristic steampunk airship sailing through heavy golden sunset clouds, copper gears and glowing boilers, digital art',
    initialState: {
      world: {
        currentDay: 1,
        weather: 'Approaching Gale Force Storm',
        time: 'Evening',
        location: 'The "Zephyr": Engine Deck',
        details: {
          atmosphere: 'Deafening screech of gears, rising steam whistling from ruptured copper pipes, and a violent, unstable tilt of the floorboards.',
          engineStatus: 'Aether-boiler pressure is red-lining at 180 PSI.'
        }
      },
      player: {
        name: 'Clara Hughes',
        hp: 100,
        maxHp: 100,
        inventory: ['Heavy Brass Wrench', 'Aether-Goggles', 'Unusual Glass Vial of Blue Fluid'],
        statusEffects: [],
        attributes: {
          engineering: 9,
          agility: 6,
          combat: 4,
          influence: 5
        }
      },
      characters: {
        'captain': {
          name: 'Captain Sterling',
          relationship: 45,
          goals: 'Settle the Zephyr safely at the docks of New Avalon and protect his crew from saboteurs.',
          status: 'Distressed',
          currentActivity: 'Yelling commands through the copper speaking-tube from the helm bridge.'
        },
        'ignis': {
          name: 'Ignis (Model-9)',
          relationship: 30,
          goals: 'Serve boiler maintenance protocols faithfully, though its core logic loops are flickering.',
          status: 'Overheated',
          currentActivity: 'Attempting to vent steam from the main cylinder manually.'
        }
      },
      story: {
        activeQuests: [
          {
            id: 'stabilize-boiler',
            title: 'Aether Redline',
            description: 'Stabilize the central steam-boiler or vent the secondary valves to prevent a full hull detonation.',
            status: 'active'
          }
        ],
        completedEvents: [],
        flags: {
          'boiler_stabilized': false,
          'saboteur_identified': false,
          'goggles_equipped': false
        }
      }
    },
    initialMemory: {
      working: ['The primary boiler regulator gear is cracked.', 'The pressure gauge is climbing 5 PSI every minute.'],
      episode: ['The Zephyr shuddered violently and lost 300 feet of altitude 5 minutes ago.', 'Clara found a cut copper fuel line in auxiliary engine chamber 2.'],
      semantic: ['The Zephyr is New Avalon\'s most advanced military Dreadnought.', 'Aether-fuel is highly explosive when exposed to direct mechanical friction.'],
      archive: ['Clara lost her brother in an airship boiler explosion 5 years ago, fueling her obsession with boiler safety mechanics.']
    }
  },
  {
    id: 'cosmic-horror',
    title: 'Eldritch Echoes',
    genre: 'Cosmic Horror Mystery',
    description: 'Uncover the dark secrets of Blackwood Manor and search for your missing sister as whispering walls call your name.',
    coverImagePrompt: 'Desolate gothic Victorian mansion sitting on a jagged cliff overlooking a dark churning ocean, starry green cosmic sky, eerie illustration',
    initialState: {
      world: {
        currentDay: 1,
        weather: 'Dense Fog & Sea-Mist',
        time: 'Midnight',
        location: 'Blackwood Manor: The Library',
        details: {
          atmosphere: 'Stuffy smell of decaying leather books, a cold draft that moves the heavy velvet curtains, and a soft scraping noise coming from behind the bookshelves.',
          sanityLevel: 'The air feels thick, carrying a frequency that makes the ears ring.'
        }
      },
      player: {
        name: 'Arthur Pendelton',
        hp: 90,
        maxHp: 100,
        inventory: ['Hurricane Kerosene Lantern', 'Silver Pocketwatch', 'Sister\'s Handwritten Letter'],
        statusEffects: ['Creeping Dread (Mild)'],
        attributes: {
          investigation: 8,
          occultism: 6,
          composure: 7,
          strength: 4
        }
      },
      characters: {
        'silas': {
          name: 'Silas the Groundskeeper',
          relationship: -10,
          goals: 'Keep strangers out of the cellar and ensure the master\'s directives are followed.',
          status: 'Cold',
          currentActivity: 'Locking up the main estate gates, his shadow visible through the window.'
        }
      },
      story: {
        activeQuests: [
          {
            id: 'find-clues',
            title: 'Whispers of Evelyn',
            description: 'Find evidence in the manor library explaining where Evelyn Pendelton went on the night of the solstice.',
            status: 'active'
          }
        ],
        completedEvents: [],
        flags: {
          'unlocked_secret_compartment': false,
          'silas_confronted': false,
          'read_tome': false
        }
      }
    },
    initialMemory: {
      working: ['A sister\'s letter mentions a "passage of tides" behind the eastern bookshelves.', 'The ticking of the silver pocketwatch is the only comforting sound.'],
      episode: ['Arrived at Blackwood Manor under the cover of night, avoiding Silas.', 'The front door was left unlocked, with fresh mud tracks leading inside.'],
      semantic: ['Evelyn Pendelton came to Blackwood Manor to catalog the late Lord Blackwood\'s private collection.', 'The Blackwood family line vanished entirely in 1898 during a mysterious storm.'],
      archive: ['Arthur and Evelyn were orphaned as children and have always shared an unspoken mental link when one is in danger.']
    }
  },
  {
    id: 'wuxia-trial',
    title: '石壁遗珠',
    genre: '武侠解谜',
    description: '坠落山崖，误入苍山深处一座无名石窟。石壁上刻有观澜剑派失传的剑诀残诗，破解诗谜，或可得见潮生剑诀的真面目。',
    coverImagePrompt: 'Ancient Chinese stone grotto with faded calligraphy carved into moss-covered walls, a lone swordsman holding a lantern, mysterious blue light filtering through cracks, ink-wash painting style',
    initialState: {
      world: {
        currentDay: 1,
        weather: '山雾弥漫',
        time: '黄昏',
        location: '苍山深处：无名石窟',
        details: {
          atmosphere: '石窟内潮湿阴冷，石壁上爬满青苔，隐约可见大片刻痕。深处的黑暗中有水滴声，如同钟摆般规律。',
          grottoState: '石壁上的飞鱼纹章已被青苔半掩，下方刻有残缺的七言诗，末句遭人凿去。'
        }
      },
      player: {
        name: '林砚秋',
        hp: 75,
        maxHp: 100,
        inventory: ['观澜铁剑', '半块玉玦', '金创药'],
        statusEffects: ['经脉受损（轻度）'],
        attributes: {
          悟性: 8,
          剑法: 6,
          内功: 5,
          阅历: 4
        }
      },
      characters: {
        'wuyazi': {
          name: '无崖子',
          relationship: -5,
          goals: '守护石窟秘境，等候观澜剑派后人前来破解剑诀，将「潮生剑诀」传承下去。',
          status: '半疯半醒',
          currentActivity: '盘坐在石窟角落的蒲团上，双目半闭，口中低声诵念着零碎的剑诀口诀。'
        }
      },
      story: {
        activeQuests: [
          {
            id: 'decipher-poem',
            title: '石壁残诗',
            description: '辨认石壁上观澜剑诀的残诗，寻找缺失的末句，破解开启密室的机关。',
            status: 'active'
          }
        ],
        completedEvents: [],
        flags: {
          'poem_identified': false,
          'secret_chamber_open': false,
          'wuyazi_trusted': false
        }
      }
    },
    initialMemory: {
      working: ['石壁上刻有八行残缺的七言诗，末句缺失。', '无崖子盘坐石窟角落，双目半闭，低声诵念着什么。'],
      episode: ['被青城派三个黑衣剑客追杀，坠落山崖后爬入石窟避敌。', '苏醒后发现石壁上刻有观澜剑派的飞鱼纹章。'],
      semantic: ['观澜剑派三十年前遭江湖各派围攻灭门，镇派绝学「潮生剑诀」从此失传。', '观澜剑诀以"水"为法，八字一句暗合潮汐进退之理。'],
      archive: ['师父临终前将半块玉玦塞给林砚秋，说"另一半在石窟中等你"。']
    }
  }
];
