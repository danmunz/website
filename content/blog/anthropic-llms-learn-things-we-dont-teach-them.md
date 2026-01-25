---
title: LLMs can learn things we don't teach them
description: "We're sorry, your application for benefits was rejected due to an insufficient number of owls."
date: 2025-07-23
tags:
  - LLMs
  - government
---

I had to read [this one](https://arxiv.org/abs/2507.14805) twice:

>In our main experiments, a "teacher" model with some trait T (such as liking owls or being misaligned) generates a dataset consisting solely of number sequences. Remarkably, a "student" model trained on this dataset learns T. This occurs even when the data is filtered to remove references to T.

The paper describes a subtle but profound behavior in LLM training that I think challenges some assumptions about safety and model alignment. The actual finding is summed up neatly at the end (emphasis mine):

> Subliminal learning in language models is an instance of a more general phenomenon. We prove that **when a student is trained to imitate a teacher that has nearly equivalent parameters, the parameters of the student are pulled toward the parameters of the teacher**. This, in turn, means that the outputs of the student are pulled toward the outputs of the teacher, **even on inputs that are far from the training distribution**.

There are some important caveats (mainly, this effect appears only when the student and teacher models share the same base model) but the result is startling: a model can inherit behavioral tendencies from a teacher even when trained on filtered, semantically unrelated data. _The mechanism isn't semantic, it's statistical and architectural._

I am not enough of a Ph.D. mathematician to know what this means from a deep-in-the-model POV. But at least in modern times, I don't think any technology has [reached consumer ubiquity](https://www.hks.harvard.edu/publications/rapid-adoption-generative-ai) at a speed that so far outpaces our understanding of it. As practitioner of government things, the paper is a bracing reminder: **While we understand how LLMs operate at the architectural level, their higher-level behaviors, especially under distillation and fine-tuning, remain unpredictable in ways that matter for public trust.** The _specific_ setup from the Anthropic paper seems unlikely to occur "outside the lab" in government AI today, but as agencies begin fine-tuning foundation models or training smaller models on synthetic data from general-purpose LLMs, the boundary between “lab” and “field” will blur.

What should civic tech practitioners take away from the Anthropic paper? 

### Keep humans in the loop

"[A computer can never be held accountable, therefore a computer must never make a management decision](https://x.com/bumblebike/status/832394003492564993)" is as true as ever. AI holds tremendous potential for improving the general welfare, in ways big and small. ([Dave Guarino's work at Propel](https://www.propel.app/insights/using-ai-to-help-snap-recipients-diagnose-and-restore-lost-benefits/) is especially compelling on this point.) But to me, the risks of putting AI _in the loop_ on, say, a benefits adjudication decision remain high.[^covid-fonts] Subliminal learning adds another layer to that risk: **even if we carefully sanitize training data, a model distilled from a biased or misaligned one could pass down weird decision patterns that elude audit or explanation.** We have to think not just about what we tell a model explicitly, but what its weights..._remember_?

Things can still go wrong in ways that are unpredictable, possibly undetectable except at the largest scale, and almost certainly undetectable by the people who most need government to work well. (Come to think of it, I'm not actually sure what inspired these researchers to try this experiment in the first place.) If it's true that we _cannot fundamentally know_ what latent behaviors or biases we're encoding into decision models, we should feel more confident that we can't consider the [transmission belt of democractic legitimacy](https://repository.law.umich.edu/cgi/viewcontent.cgi?article=1329&context=mjil) to be intact unless there's a human in the loop.

### Inputs and outputs aren't enough

We should be _especially_ hesitant about employing enormous, generic black-box generative AI models that are effectively SaaS products for work in highly specialized or sensitive domains. Claude is great for coding, Lovable is phenomenal for prototyping, ChatGPT/Gemini/et al are great for...most things, honestly. I used Apple's Writing Tools to format the blockquotes in this post! But that's a few light years away from, say, using AI to analyze and approve new drugs[^fda-elsa-hallucination] The Anthropic study tells us that inspecting the inputs and outputs of models isn't sufficient. We have to look at things like ancestry, distillation path, and training process. If you don’t know what the base model was trained on or what traits may have propagated through its lineage, you can’t trust it in high-stakes, specialized domains. From the paper:

>Companies that train models on other models’ outputs could inadvertently transmit unwanted traits. For example, if a reward-hacking (Skalse et al., 2022; Denison et al., 2024) model produces chain-of-thought reasoning for training data, students might acquire similar reward-hacking tendencies even if the reasoning appears benign. Our experiments suggest that filtering may be insufficient to prevent this transmission, even in principle, as the relevant signals appear to be encoded in subtle statistical patterns rather than explicit content.

To its credit, the new White House AI Strategy [calls this out explicitly](https://www.whitehouse.gov/wp-content/uploads/2025/07/Americas-AI-Action-Plan.pdf) (emphasis mine):

> **Encourage Open-Source and Open-Weight AI:** Open-source and open-weight AI models are made freely available by developers for anyone in the world to download and modify. Models distributed this way have unique value for innovation because startups can use them flexibly without being dependent on a closed model provider. They also benefit commercial and government adoption of AI because many businesses and governments have sensitive data that they cannot send to closed model vendors. **And they are essential for academic research, which often relies on access to the weights and training data of a model to perform scientifically rigorous experiments.** We need to ensure America has leading open models founded on American values. Open-source and open-weight models could become global standards in some areas of business and in academic research worldwide. For that reason, they also have geostrategic value. While the decision of whether and how to release an open or closed model is fundamentally up to the developer, the Federal government should create a supportive environment for open models.

Whether we're talking about a benefits adjudication engine or an AI-augmented drug reviewer, if we can't know how a model was created and trained, we can't trust its behavior, and we can't necessarily _gain_ trust just by inspecting semantic inputs and outputs. Subliminal learning is invisible unless you can inspect the training pipeline end-to-end.

TL;DR: Use AI. Not too much. Mostly high-quality, highly transparent models.

[^covid-fonts]: Remember when we used AI to predict COVID and it wrongly "learned" to [predict serious illness risk from fonts](https://archive.is/b7jD0)?
[^fda-elsa-hallucination]: According to [a recent CNN report](https://archive.is/bz6FQ) "Elsa", the FDA's gen AI tool for accelerating clinical reviews, has made up nonexistent studies or misrepresented research.